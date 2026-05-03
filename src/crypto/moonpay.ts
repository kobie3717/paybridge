/**
 * MoonPay crypto on/off-ramp provider
 * @see https://dev.moonpay.com
 */

import crypto from 'crypto';
import { CryptoRampProvider, validateWalletAddress } from './base';
import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
  CryptoRampCapabilities,
  CryptoAsset,
  CryptoNetwork,
} from './types';
import { Currency } from '../types';
import { timedFetch } from '../utils/fetch';

interface MoonPayConfig {
  apiKey: string;
  secretKey: string;
  sandbox: boolean;
  webhookSecret?: string;
}

export class MoonPayProvider extends CryptoRampProvider {
  readonly name = 'moonpay';

  private apiKey: string;
  private secretKey: string;
  private sandbox: boolean;
  private baseUrl: string;
  private widgetUrl: string;
  private webhookSecret?: string;

  constructor(config: MoonPayConfig) {
    super();

    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.sandbox = config.sandbox;
    this.webhookSecret = config.webhookSecret;

    // Sandbox vs live is determined by API key prefix (pk_test_* vs pk_live_*)
    this.baseUrl = 'https://api.moonpay.com';

    this.widgetUrl = this.sandbox
      ? 'https://buy-sandbox.moonpay.com'
      : 'https://buy.moonpay.com';
  }

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    _network: string
  ): Promise<RampQuote> {
    const endpoint = direction === 'on' ? 'quote' : 'sell_quote';

    let params: URLSearchParams;
    if (direction === 'on') {
      params = new URLSearchParams({
        apiKey: this.apiKey,
        baseCurrencyCode: fiatCurrency.toLowerCase(),
        quoteCurrencyCode: cryptoAsset.toLowerCase(),
        baseCurrencyAmount: fiatAmount.toString(),
      });
    } else {
      params = new URLSearchParams({
        apiKey: this.apiKey,
        baseCurrencyCode: cryptoAsset.toLowerCase(),
        quoteCurrencyCode: fiatCurrency.toLowerCase(),
        baseCurrencyAmount: fiatAmount.toString(),
      });
    }

    const url = `${this.baseUrl}/v3/currencies/${cryptoAsset.toLowerCase()}/${endpoint}?${params}`;

    const response = await timedFetch(url);
    if (!response.ok) {
      throw new Error(`MoonPay quote failed: ${response.status}`);
    }

    const data = await response.json() as any;

    const feeTotal = data.feeAmount || 0;
    const rate = data.quoteCurrencyPrice || 0;
    const cryptoAmount = data.quoteCurrencyAmount || 0;

    return {
      fiatAmount,
      cryptoAmount,
      rate,
      feeFixed: 0,
      feePercent: (feeTotal / fiatAmount) * 100,
      feeTotal,
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

    const widgetParams = new URLSearchParams({
      apiKey: this.apiKey,
      currencyCode: params.asset.toLowerCase(),
      baseCurrencyCode: params.fiatCurrency.toLowerCase(),
      baseCurrencyAmount: params.fiatAmount.toString(),
      walletAddress: params.destinationWallet,
      email: params.customer.email,
      externalTransactionId: params.reference,
      redirectURL: params.urls.success,
    });

    const signature = this.signWidgetUrl(`?${widgetParams.toString()}`);
    widgetParams.append('signature', signature);

    const checkoutUrl = `${this.widgetUrl}?${widgetParams}`;

    return {
      id: `moonpay_on_${params.reference}`,
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

    const sellWidgetUrl = this.sandbox
      ? 'https://sell-sandbox.moonpay.com'
      : 'https://sell.moonpay.com';

    const widgetParams = new URLSearchParams({
      apiKey: this.apiKey,
      baseCurrencyCode: params.asset.toLowerCase(),
      quoteCurrencyCode: params.fiatCurrency.toLowerCase(),
      baseCurrencyAmount: params.cryptoAmount.toString(),
      externalTransactionId: params.reference,
      refundWalletAddress: params.sourceWallet || '',
      redirectURL: params.urls?.success || '',
    });

    const signature = this.signWidgetUrl(`?${widgetParams.toString()}`);
    widgetParams.append('signature', signature);

    const checkoutUrl = `${sellWidgetUrl}?${widgetParams}`;

    return {
      id: `moonpay_off_${params.reference}`,
      direction: 'off',
      status: 'pending',
      quote,
      checkoutUrl,
      createdAt: new Date().toISOString(),
      expiresAt: quote.expiresAt,
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    const response = await timedFetch(`${this.baseUrl}/v3/transactions/${id}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`MoonPay getRamp failed: ${response.status}`);
    }

    const data = await response.json() as any;

    const direction: 'on' | 'off' = data.type === 'buy' ? 'on' : 'off';
    const status = this.mapMoonPayStatus(data.status);

    const quote: RampQuote = {
      fiatAmount: data.baseCurrencyAmount || 0,
      cryptoAmount: data.quoteCurrencyAmount || 0,
      rate: data.quoteCurrencyPrice || 0,
      feeFixed: 0,
      feePercent: 0,
      feeTotal: data.feeAmount || 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    const sanitizedRaw = { ...data };
    if (sanitizedRaw.bankAccount) delete sanitizedRaw.bankAccount;
    if (sanitizedRaw.bank_account) delete sanitizedRaw.bank_account;

    return {
      id: data.id,
      direction,
      status,
      quote,
      txHash: data.cryptoTransactionId,
      createdAt: data.createdAt,
      raw: sanitizedRaw,
    };
  }

  parseWebhook(body: any, _headers?: any): any {
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      type: event.type,
      data: event.data,
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) return false;

    // Try V2 signature first (recommended)
    const signatureV2 = headers?.['moonpay-signature-v2'];
    if (signatureV2) {
      return this.verifyWebhookV2(body, signatureV2);
    }

    // Fall back to legacy signature
    const signature = headers?.['moonpay-signature'] || headers?.signature;
    if (!signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  private verifyWebhookV2(body: string | Buffer, signatureHeader: string): boolean {
    if (!this.webhookSecret) return false;

    // Parse V2 format: t=<timestamp>,s=<signature>
    const parts = signatureHeader.split(',');
    let timestamp: string | undefined;
    let signature: string | undefined;

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') timestamp = value;
      if (key === 's') signature = value;
    }

    if (!timestamp || !signature) return false;

    // Replay protection: timestamp must be within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

    // Verify signature: HMAC-SHA256 of ${timestamp}.${body}
    const bodyStr = Buffer.isBuffer(body) ? body.toString('utf8') : body;
    const payload = `${timestamp}.${bodyStr}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL'],
      supportedNetworks: ['BTC', 'ETH', 'TRON', 'POLYGON', 'BSC', 'SOLANA'],
      supportedFiat: ['USD', 'EUR', 'GBP', 'ZAR'],
      country: 'GLOBAL',
      kycRequired: true,
      onRampLimits: {
        min: 20,
        max: 50000,
      },
      offRampLimits: {
        min: 30,
        max: 50000,
      },
      fees: {
        onRampPercent: 4.5,
        offRampPercent: 1.0,
      },
    };
  }

  private signWidgetUrl(queryString: string): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(queryString)
      .digest('base64');
  }

  private mapMoonPayStatus(moonpayStatus: string): 'pending' | 'completed' | 'failed' | 'expired' {
    const statusMap: Record<string, 'pending' | 'completed' | 'failed' | 'expired'> = {
      waitingPayment: 'pending',
      pending: 'pending',
      waitingAuthorization: 'pending',
      completed: 'completed',
      failed: 'failed',
      expired: 'expired',
    };

    return statusMap[moonpayStatus] || 'pending';
  }
}
