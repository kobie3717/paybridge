/**
 * CryptoRamp — Unified crypto on/off-ramp SDK
 */

import { CryptoRampProvider } from './base';
import { MoonPayProvider } from './moonpay';
import { YellowCardProvider } from './yellowcard';
import { MockCryptoRampProvider } from './mock';
import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
  CryptoRampCapabilities,
} from './types';

export * from './types';
export * from './base';
export * from './moonpay';
export * from './yellowcard';
export * from './mock';
export * from './router';

export type CryptoProvider = 'moonpay' | 'yellowcard' | 'mock';

export interface CryptoRampConfig {
  provider: CryptoProvider;
  credentials: {
    apiKey?: string;
    secretKey?: string;
    [key: string]: any;
  };
  sandbox?: boolean;
  webhookSecret?: string;
}

export class CryptoRamp {
  private provider: CryptoRampProvider;

  constructor(config: CryptoRampConfig) {
    this.provider = this.createProvider(config);
  }

  private createProvider(config: CryptoRampConfig): CryptoRampProvider {
    const { provider, credentials, sandbox = true, webhookSecret } = config;

    switch (provider) {
      case 'moonpay':
        if (!credentials.apiKey || !credentials.secretKey) {
          throw new Error('MoonPay requires apiKey and secretKey');
        }
        return new MoonPayProvider({
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          sandbox,
          webhookSecret,
        });

      case 'yellowcard':
        if (!credentials.apiKey || !credentials.secretKey) {
          throw new Error('Yellow Card requires apiKey and secretKey');
        }
        return new YellowCardProvider({
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          sandbox,
          webhookSecret,
        });

      case 'mock':
        return new MockCryptoRampProvider();

      default:
        throw new Error(`Unknown crypto provider: ${provider}`);
    }
  }

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    network: string
  ): Promise<RampQuote> {
    return this.provider.getQuote(direction, fiatAmount, fiatCurrency, cryptoAsset, network);
  }

  async createOnRamp(params: OnRampParams): Promise<RampResult> {
    if (!Number.isFinite(params.fiatAmount) || params.fiatAmount <= 0) {
      throw new Error('Invalid amount: must be a positive finite number');
    }
    return this.provider.createOnRamp(params);
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    if (!Number.isFinite(params.cryptoAmount) || params.cryptoAmount <= 0) {
      throw new Error('Invalid amount: must be a positive finite number');
    }
    return this.provider.createOffRamp(params);
  }

  async getRamp(id: string): Promise<RampResult> {
    return this.provider.getRamp(id);
  }

  parseWebhook(body: any, headers?: any): any {
    return this.provider.parseWebhook(body, headers);
  }

  verifyWebhook(body: any, headers?: any): boolean {
    return this.provider.verifyWebhook(body, headers);
  }

  getCapabilities(): CryptoRampCapabilities {
    return this.provider.getCapabilities();
  }

  getProviderName(): string {
    return this.provider.name;
  }
}

export default CryptoRamp;
