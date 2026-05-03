/**
 * Mock crypto ramp provider for testing
 */

import { CryptoRampProvider, validateWalletAddress } from './base';
import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
  CryptoRampCapabilities,
} from './types';

export class MockCryptoRampProvider extends CryptoRampProvider {
  readonly name = 'mock';

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    _network: string
  ): Promise<RampQuote> {
    const mockRate = cryptoAsset === 'BTC' ? 50000 : cryptoAsset === 'ETH' ? 3000 : 1;
    const cryptoAmount = fiatAmount / mockRate;
    const feePercent = direction === 'on' ? 3.5 : 2.0;
    const feeTotal = fiatAmount * (feePercent / 100);

    return {
      fiatAmount,
      cryptoAmount,
      rate: mockRate,
      feeFixed: 0,
      feePercent,
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

    return {
      id: `mock_on_${Date.now()}`,
      direction: 'on',
      status: 'pending',
      quote,
      checkoutUrl: `https://mock-ramp.example.com/checkout/${params.reference}`,
      createdAt: new Date().toISOString(),
      expiresAt: quote.expiresAt,
    };
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    if (params.sourceWallet) {
      validateWalletAddress(params.sourceWallet, params.network);
    }

    const mockRate = params.asset === 'BTC' ? 50000 : params.asset === 'ETH' ? 3000 : 1;
    const fiatAmount = params.cryptoAmount * mockRate;

    const quote = await this.getQuote(
      'off',
      fiatAmount,
      params.fiatCurrency,
      params.asset,
      params.network
    );

    return {
      id: `mock_off_${Date.now()}`,
      direction: 'off',
      status: 'pending',
      quote,
      depositAddress: '0xMOCK1234567890ABCDEF',
      depositTag: 'MOCK123',
      createdAt: new Date().toISOString(),
      expiresAt: quote.expiresAt,
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    const direction: 'on' | 'off' = id.includes('_on_') ? 'on' : 'off';

    const quote: RampQuote = {
      fiatAmount: 1000,
      cryptoAmount: 0.02,
      rate: 50000,
      feeFixed: 0,
      feePercent: 3.5,
      feeTotal: 35,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    return {
      id,
      direction,
      status: 'completed',
      quote,
      txHash: '0xMOCKTXHASH123456',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
  }

  parseWebhook(body: any, _headers?: any): any {
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      type: 'transaction.completed',
      data: event,
      raw: event,
    };
  }

  verifyWebhook(_body: any, _headers?: any): boolean {
    return true;
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC'],
      supportedNetworks: ['BTC', 'ETH', 'TRON', 'POLYGON', 'BSC'],
      supportedFiat: ['ZAR', 'USD', 'EUR', 'GBP'],
      country: 'GLOBAL',
      kycRequired: false,
      onRampLimits: {
        min: 10,
        max: 100000,
      },
      offRampLimits: {
        min: 10,
        max: 100000,
      },
      fees: {
        onRampPercent: 3.5,
        offRampPercent: 2.0,
      },
    };
  }
}
