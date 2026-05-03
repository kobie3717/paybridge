/**
 * Yellow Card crypto on/off-ramp provider
 * @see https://yellowcard.io
 *
 * WARNING: This implementation is NOT verified against official Yellow Card API documentation.
 * No public documentation, SDK, or API reference could be found (checked 2026-05-03).
 * All signing logic, header names, and endpoints are SPECULATIVE based on common patterns.
 *
 * Known gaps requiring verification:
 * - Base URLs (sandbox.api.yellowcard.io / api.yellowcard.io)
 * - Endpoint paths (/v1/quotes/buy, /v1/orders/buy, /v1/orders/sell)
 * - Header names (X-API-Key, X-Timestamp, X-Signature)
 * - Signature algorithm (HMAC-SHA256 of method+path+timestamp+body, hex-encoded)
 * - Webhook signature scheme and header name
 *
 * To verify: Contact Yellow Card for partner API documentation or request sandbox credentials
 * to test against their actual endpoints.
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

interface YellowCardConfig {
  apiKey: string;
  secretKey: string;
  sandbox: boolean;
  webhookSecret?: string;
}

/**
 * Yellow Card crypto on/off-ramp provider.
 *
 * @experimental Yellow Card public API documentation could not be located. Endpoint paths,
 *   header names, signature algorithm, and webhook scheme are all speculative — based on
 *   common patterns, not verified against an official spec or SDK. Will not work against
 *   real Yellow Card sandbox without spec confirmation. Use only with partner-provided
 *   integration docs.
 */
export class YellowCardProvider extends CryptoRampProvider {
  readonly name = 'yellowcard';

  private apiKey: string;
  private secretKey: string;
  private sandbox: boolean;
  private baseUrl: string;
  private webhookSecret?: string;
  private static warnedExperimental = false;

  constructor(config: YellowCardConfig) {
    super();

    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.sandbox = config.sandbox;
    this.webhookSecret = config.webhookSecret;

    this.baseUrl = this.sandbox
      ? 'https://sandbox.api.yellowcard.io'
      : 'https://api.yellowcard.io';

    if (!YellowCardProvider.warnedExperimental) {
      console.warn(
        '[paybridge] YellowCardProvider is experimental — see @experimental notes in source. Do not use in production without verifying spec against partner docs.'
      );
      YellowCardProvider.warnedExperimental = true;
    }
  }

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    network: string
  ): Promise<RampQuote> {
    const endpoint = direction === 'on' ? '/v1/quotes/buy' : '/v1/quotes/sell';

    const requestBody = {
      fiatCurrency: fiatCurrency.toUpperCase(),
      cryptoCurrency: cryptoAsset.toUpperCase(),
      fiatAmount,
      network: network.toUpperCase(),
    };

    const response = await this.apiRequest('POST', endpoint, requestBody);

    const rate = response.rate || 0;
    const cryptoAmount = response.cryptoAmount || 0;
    const feeTotal = response.fee || 0;

    return {
      fiatAmount,
      cryptoAmount,
      rate,
      feeFixed: 0,
      feePercent: (feeTotal / fiatAmount) * 100,
      feeTotal,
      expiresAt: response.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
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

    const requestBody = {
      cryptoCurrency: params.asset.toUpperCase(),
      fiatCurrency: params.fiatCurrency.toUpperCase(),
      fiatAmount: params.fiatAmount,
      network: params.network.toUpperCase(),
      walletAddress: params.destinationWallet,
      customer: {
        email: params.customer.email,
        name: params.customer.name,
        phone: params.customer.phone,
      },
      callbackUrl: params.urls.webhook,
      successUrl: params.urls.success,
      cancelUrl: params.urls.cancel,
      externalReference: params.reference,
    };

    const response = await this.apiRequest('POST', '/v1/orders/buy', requestBody);

    const sanitizedRaw = { ...response };
    if (sanitizedRaw.bankAccount) delete sanitizedRaw.bankAccount;
    if (sanitizedRaw.bank_account) delete sanitizedRaw.bank_account;

    return {
      id: response.id || `yc_on_${params.reference}`,
      direction: 'on',
      status: this.mapYellowCardStatus(response.status),
      quote,
      checkoutUrl: response.checkoutUrl || response.paymentUrl,
      createdAt: response.createdAt || new Date().toISOString(),
      expiresAt: quote.expiresAt,
      raw: sanitizedRaw,
    };
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    if (params.sourceWallet) {
      validateWalletAddress(params.sourceWallet, params.network);
    }

    // Get real quote instead of synthetic calculation
    // TODO(verify): Confirm Yellow Card supports off-ramp quotes via /v1/quotes/sell
    // If the API doesn't support quotes for sell orders, this will fail and we need to handle it
    const quote = await this.getQuote(
      'off',
      params.cryptoAmount * 50000, // Estimate fiat for quote
      params.fiatCurrency,
      params.asset,
      params.network
    );

    const requestBody = {
      cryptoCurrency: params.asset.toUpperCase(),
      fiatCurrency: params.fiatCurrency.toUpperCase(),
      cryptoAmount: params.cryptoAmount,
      network: params.network.toUpperCase(),
      bankAccount: {
        accountNumber: params.bankAccount.accountNumber,
        bankCode: params.bankAccount.branchCode,
        accountName: params.bankAccount.accountHolder,
        bankName: params.bankAccount.bankName,
      },
      customer: {
        email: params.customer.email,
        name: params.customer.name,
        phone: params.customer.phone,
      },
      externalReference: params.reference,
    };

    const response = await this.apiRequest('POST', '/v1/orders/sell', requestBody);

    const sanitizedRaw = { ...response };
    if (sanitizedRaw.bankAccount) delete sanitizedRaw.bankAccount;
    if (sanitizedRaw.bank_account) delete sanitizedRaw.bank_account;

    return {
      id: response.id || `yc_off_${params.reference}`,
      direction: 'off',
      status: this.mapYellowCardStatus(response.status),
      quote,
      depositAddress: response.depositAddress,
      depositTag: response.memo || response.tag,
      createdAt: response.createdAt || new Date().toISOString(),
      expiresAt: quote.expiresAt,
      raw: sanitizedRaw,
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    const response = await this.apiRequest('GET', `/v1/orders/${id}`);

    const direction: 'on' | 'off' = response.type === 'buy' ? 'on' : 'off';
    const status = this.mapYellowCardStatus(response.status);

    const quote: RampQuote = {
      fiatAmount: response.fiatAmount || 0,
      cryptoAmount: response.cryptoAmount || 0,
      rate: response.rate || 0,
      feeFixed: 0,
      feePercent: 0,
      feeTotal: response.fee || 0,
      expiresAt: response.expiresAt || new Date().toISOString(),
    };

    const sanitizedRaw = { ...response };
    if (sanitizedRaw.bankAccount) delete sanitizedRaw.bankAccount;
    if (sanitizedRaw.bank_account) delete sanitizedRaw.bank_account;

    return {
      id: response.id,
      direction,
      status,
      quote,
      txHash: response.txHash || response.transactionHash,
      createdAt: response.createdAt || new Date().toISOString(),
      raw: sanitizedRaw,
    };
  }

  parseWebhook(body: any, _headers?: any): any {
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      type: event.eventType || event.type,
      orderId: event.orderId || event.id,
      status: event.status,
      data: event,
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) return false;

    // TODO(verify): Confirm Yellow Card webhook signature scheme and header names
    // Current implementation: HMAC-SHA256(webhookSecret, body) in hex format
    // Common alternatives: timestamp-based scheme like HMAC-SHA256(secret, timestamp.body)
    // Header name might be X-YC-Signature, X-Signature, or x-yellowcard-signature
    const signature = headers?.['x-yellowcard-signature'] || headers?.['x-signature'] || headers?.signature;
    if (!signature) return false;

    // Check if this is a timestamp-based signature (format: "t=timestamp,s=signature")
    const timestampMatch = signature.match(/^t=(\d+),s=([a-f0-9]+)$/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10);
      const sig = timestampMatch[2];

      // Replay protection: reject timestamps older than 5 minutes
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > 300) {
        return false;
      }

      const payload = `${timestamp}.${body}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expectedSignature);
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    }

    // Fallback: simple HMAC-SHA256(body) verification
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC'],
      supportedNetworks: ['BTC', 'ETH', 'TRON', 'POLYGON'],
      supportedFiat: ['ZAR', 'NGN', 'KES', 'UGX', 'GHS'],
      country: 'AFRICA',
      kycRequired: true,
      onRampLimits: {
        min: 10,
        max: 100000,
      },
      offRampLimits: {
        min: 20,
        max: 100000,
      },
      fees: {
        onRampPercent: 3.5,
        offRampPercent: 2.0,
      },
      experimental: true,
    };
  }

  private async apiRequest(method: string, path: string, body?: any): Promise<any> {
    const timestamp = Date.now().toString();
    const bodyString = body ? JSON.stringify(body) : '';
    const signature = this.generateSignature(method, path, timestamp, bodyString);

    const url = `${this.baseUrl}${path}`;

    // TODO(verify): Confirm Yellow Card API header names
    // Current: X-API-Key, X-Timestamp, X-Signature
    // Common alternatives: X-YC-API-Key, X-YC-Timestamp, X-YC-Signature
    // Or: Authorization header + separate X-Signature
    const response = await timedFetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: body ? bodyString : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yellow Card API error (${method} ${path}): ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  private generateSignature(method: string, path: string, timestamp: string, body: string): string {
    // TODO(verify): Confirm Yellow Card signature algorithm
    // Current: HMAC-SHA256(secret, method+path+timestamp+body) -> hex
    // Common alternative patterns:
    //   1. HMAC-SHA256(secret, path+base64(SHA256(body))+timestamp+method) -> base64
    //   2. HMAC-SHA256(secret, timestamp+method+path+body) -> hex
    //   3. HMAC-SHA256(secret, method+path+timestamp+SHA256(body)) -> base64
    // Without official docs/SDK, current implementation is speculative
    const message = `${method}${path}${timestamp}${body}`;
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message)
      .digest('hex');
  }

  private mapYellowCardStatus(ycStatus: string): 'pending' | 'completed' | 'failed' | 'expired' {
    const statusMap: Record<string, 'pending' | 'completed' | 'failed' | 'expired'> = {
      pending: 'pending',
      processing: 'pending',
      completed: 'completed',
      success: 'completed',
      failed: 'failed',
      cancelled: 'failed',
      expired: 'expired',
    };

    return statusMap[ycStatus?.toLowerCase()] || 'pending';
  }
}
