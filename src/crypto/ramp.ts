/**
 * Ramp Network crypto on/off-ramp provider
 * @see https://docs.ramp.network/
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

interface RampConfig {
  hostApiKey: string;
  webhookSecret?: string;
  sandbox: boolean;
}

export class RampProvider extends CryptoRampProvider {
  readonly name = 'ramp';

  private hostApiKey: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private widgetUrl: string;
  private apiUrl: string;

  constructor(config: RampConfig) {
    super();

    this.hostApiKey = config.hostApiKey;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox;

    this.widgetUrl = this.sandbox
      ? 'https://ri-widget-staging.firebaseapp.com'
      : 'https://buy.ramp.network';

    this.apiUrl = 'https://api.ramp.network/api/host-api/v3';
  }

  async getQuote(
    _direction: 'on' | 'off',
    fiatAmount: number,
    _fiatCurrency: string,
    _cryptoAsset: string,
    _network: string
  ): Promise<RampQuote> {
    return {
      fiatAmount,
      cryptoAmount: 0,
      rate: 0,
      feeFixed: 0,
      feePercent: 2.9,
      feeTotal: (fiatAmount * 2.9) / 100,
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

    const swapAsset = `${params.asset}_${params.network}`;

    const queryParams = new URLSearchParams({
      hostApiKey: this.hostApiKey,
      swapAsset: swapAsset.toUpperCase(),
      fiatCurrency: params.fiatCurrency.toUpperCase(),
      fiatValue: params.fiatAmount.toString(),
      userAddress: params.destinationWallet,
      userEmailAddress: params.customer.email,
      finalUrl: params.urls.success,
    });

    const checkoutUrl = `${this.widgetUrl}?${queryParams}`;

    return {
      id: `ramp_on_${params.reference}`,
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

    const swapAsset = `${params.asset}_${params.network}`;

    const queryParams = new URLSearchParams({
      hostApiKey: this.hostApiKey,
      swapAsset: swapAsset.toUpperCase(),
      defaultFlow: 'OFFRAMP',
    });

    const checkoutUrl = `${this.widgetUrl}?${queryParams}`;

    return {
      id: `ramp_off_${params.reference}`,
      direction: 'off',
      status: 'pending',
      quote,
      checkoutUrl,
      createdAt: new Date().toISOString(),
      expiresAt: quote.expiresAt,
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    const response = await timedFetch(`${this.apiUrl}/${id}`);

    if (!response.ok) {
      throw new Error(`Ramp Network getRamp failed: ${response.status}`);
    }

    const data = (await response.json()) as any;

    const direction: 'on' | 'off' = data.type === 'ONRAMP' ? 'on' : 'off';
    const status = this.mapRampStatus(data.status);

    const quote: RampQuote = {
      fiatAmount: data.fiatValue || 0,
      cryptoAmount: data.cryptoAmount || 0,
      rate: data.assetExchangeRate || 0,
      feeFixed: 0,
      feePercent: 0,
      feeTotal: data.appliedFee || 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    return {
      id: data.id,
      direction,
      status,
      quote,
      txHash: data.cryptoTxHash,
      createdAt: data.createdAt,
      raw: data,
    };
  }

  parseWebhook(body: any, _headers?: any): any {
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      type: event.type,
      data: event.purchase || event,
      raw: event,
    };
  }

  /**
   * Ramp Network webhook verification (HMAC placeholder).
   *
   * TODO(verify): Ramp Network uses ECDSA secp256k1 for webhook signatures.
   * This implementation uses HMAC-SHA256 as a placeholder. Production deployments
   * should implement ECDSA verification using Ramp's public key.
   */
  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) return false;

    const signature = headers?.['x-body-signature'];
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
      supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC', 'DAI', 'MATIC'],
      supportedNetworks: ['BTC', 'ETH', 'POLYGON', 'BSC'],
      supportedFiat: ['USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'CAD'],
      country: 'GLOBAL',
      kycRequired: true,
      onRampLimits: { min: 30, max: 30000 },
      offRampLimits: { min: 50, max: 30000 },
      fees: {
        onRampPercent: 2.9,
        offRampPercent: 1.9,
      },
    };
  }

  private mapRampStatus(rampStatus: string): 'pending' | 'completed' | 'failed' | 'expired' {
    const statusMap: Record<string, 'pending' | 'completed' | 'failed' | 'expired'> = {
      INITIALIZED: 'pending',
      PAYMENT_STARTED: 'pending',
      PAYMENT_IN_PROGRESS: 'pending',
      PAYMENT_EXECUTED: 'pending',
      FIAT_SENT: 'pending',
      FIAT_RECEIVED: 'pending',
      RELEASING: 'pending',
      RELEASED: 'completed',
      EXPIRED: 'expired',
      CANCELLED: 'expired',
    };

    return statusMap[rampStatus] || 'pending';
  }
}
