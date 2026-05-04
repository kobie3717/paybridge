/**
 * Transak crypto on/off-ramp provider
 * @see https://docs.transak.com/
 */

import crypto from 'crypto';
import { CryptoRampProvider, validateWalletAddress } from './base';
import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
  CryptoRampCapabilities,
} from './types';
import { timedFetch } from '../utils/fetch';

interface TransakConfig {
  apiKey: string;
  apiSecret: string;
  sandbox: boolean;
  webhookSecret?: string;
}

export class TransakProvider extends CryptoRampProvider {
  readonly name = 'transak';

  private apiKey: string;
  private apiSecret: string;
  private sandbox: boolean;
  private widgetUrl: string;
  private apiUrl: string;
  private webhookSecret?: string;

  constructor(config: TransakConfig) {
    super();

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.sandbox = config.sandbox;
    this.webhookSecret = config.webhookSecret;

    this.widgetUrl = this.sandbox
      ? 'https://global-stg.transak.com'
      : 'https://global.transak.com';

    this.apiUrl = this.sandbox
      ? 'https://api-stg.transak.com'
      : 'https://api.transak.com';
  }

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    _network: string
  ): Promise<RampQuote> {
    const params = new URLSearchParams({
      fiatCurrency: fiatCurrency.toUpperCase(),
      cryptoCurrency: cryptoAsset.toUpperCase(),
      fiatAmount: fiatAmount.toString(),
      paymentMethod: 'credit_debit_card',
      isBuyOrSell: direction === 'on' ? 'BUY' : 'SELL',
    });

    const url = `${this.apiUrl}/api/v2/currencies/price?${params}`;

    const response = await timedFetch(url, {
      headers: {
        'api-secret': this.apiSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`Transak quote failed: ${response.status}`);
    }

    const data = (await response.json()) as any;

    const cryptoAmount = data.response?.cryptoAmount || 0;
    const totalFee = data.response?.totalFee || 0;
    const rate = fiatAmount > 0 ? cryptoAmount / fiatAmount : 0;

    return {
      fiatAmount,
      cryptoAmount,
      rate,
      feeFixed: 0,
      feePercent: (totalFee / fiatAmount) * 100,
      feeTotal: totalFee,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async createOnRamp(params: OnRampParams): Promise<RampResult> {
    validateWalletAddress(params.destinationWallet, params.network);

    const quote = await this.getQuote(
      'on',
      params.fiatAmount,
      params.fiatCurrency,
      params.asset,
      params.network
    );

    const queryParams = new URLSearchParams({
      apiKey: this.apiKey,
      fiatAmount: params.fiatAmount.toString(),
      fiatCurrency: params.fiatCurrency.toUpperCase(),
      cryptoCurrencyCode: params.asset.toUpperCase(),
      network: params.network.toUpperCase(),
      walletAddress: params.destinationWallet,
      email: params.customer.email,
      partnerOrderId: params.reference,
      redirectURL: params.urls.success,
    });

    const signature = this.signWidgetUrl(queryParams.toString());
    queryParams.append('signature', signature);

    const checkoutUrl = `${this.widgetUrl}?${queryParams}`;

    return {
      id: `transak_on_${params.reference}`,
      direction: 'on' as const,
      status: 'pending' as const,
      quote,
      checkoutUrl,
      createdAt: new Date().toISOString(),
      expiresAt: quote.expiresAt,
    };
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    if (params.sourceWallet) {
      validateWalletAddress(params.sourceWallet, params.network);
    }

    const quote = await this.getQuote(
      'off',
      params.cryptoAmount,
      params.fiatCurrency,
      params.asset,
      params.network
    );

    const queryParams = new URLSearchParams({
      apiKey: this.apiKey,
      productsAvailed: 'SELL',
      cryptoCurrencyCode: params.asset.toUpperCase(),
      network: params.network.toUpperCase(),
      fiatCurrency: params.fiatCurrency.toUpperCase(),
      partnerOrderId: params.reference,
    });

    if (params.urls?.success) {
      queryParams.append('redirectURL', params.urls.success);
    }

    const signature = this.signWidgetUrl(queryParams.toString());
    queryParams.append('signature', signature);

    const checkoutUrl = `${this.widgetUrl}?${queryParams}`;

    return {
      id: `transak_off_${params.reference}`,
      direction: 'off',
      status: 'pending',
      quote,
      checkoutUrl,
      createdAt: new Date().toISOString(),
      expiresAt: quote.expiresAt,
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    const response = await timedFetch(`${this.apiUrl}/api/v2/orders/${id}`, {
      headers: {
        'api-secret': this.apiSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`Transak getRamp failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const order = data.response;

    const direction: 'on' | 'off' = order.isBuyOrSell === 'BUY' ? 'on' : 'off';
    const status = this.mapTransakStatus(order.status);

    const quote: RampQuote = {
      fiatAmount: order.fiatAmount || 0,
      cryptoAmount: order.cryptoAmount || 0,
      rate: order.conversionPrice || 0,
      feeFixed: 0,
      feePercent: 0,
      feeTotal: order.totalFee || 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    return {
      id: order.id,
      direction,
      status,
      quote,
      txHash: order.transactionHash,
      createdAt: order.createdAt,
      raw: data,
    };
  }

  parseWebhook(body: any, _headers?: any): any {
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      type: event.eventName,
      data: event.data,
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) return false;

    const signature = headers?.['x-transak-signature'];
    if (!signature) return false;

    const rawBody = typeof body === 'string' ? body : body.toString('utf8');

    const computedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    try {
      const computedBuffer = Buffer.from(computedSig, 'hex');
      const expectedBuffer = Buffer.from(signature, 'hex');

      if (computedBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'BNB'],
      supportedNetworks: ['BTC', 'ETH', 'POLYGON', 'BSC', 'TRON'],
      supportedFiat: ['USD', 'EUR', 'GBP', 'ZAR', 'INR', 'AUD'],
      country: 'GLOBAL',
      kycRequired: true,
      onRampLimits: { min: 30, max: 50000 },
      offRampLimits: { min: 50, max: 50000 },
      fees: {
        onRampPercent: 2.0,
        offRampPercent: 1.5,
      },
    };
  }

  private signWidgetUrl(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('base64');
  }

  private mapTransakStatus(transakStatus: string): 'pending' | 'completed' | 'failed' | 'expired' {
    const statusMap: Record<string, 'pending' | 'completed' | 'failed' | 'expired'> = {
      AWAITING_PAYMENT_FROM_USER: 'pending',
      PROCESSING: 'pending',
      COMPLETED: 'completed',
      FAILED: 'failed',
      EXPIRED: 'expired',
      CANCELLED: 'expired',
    };

    return statusMap[transakStatus] || 'pending';
  }
}
