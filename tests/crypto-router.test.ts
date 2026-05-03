/**
 * Crypto router tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CryptoRamp, CryptoRampRouter, RoutingError } from '../src';
import { CryptoRampProvider } from '../src/crypto/base';
import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
  CryptoRampCapabilities,
} from '../src/crypto/types';

class HighFeeMockProvider extends CryptoRampProvider {
  readonly name = 'high-fee-mock';

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    _fiatCurrency: string,
    _cryptoAsset: string,
    _network: string
  ): Promise<RampQuote> {
    return {
      fiatAmount,
      cryptoAmount: 0.01,
      rate: 50000,
      feeFixed: 0,
      feePercent: direction === 'on' ? 5.0 : 4.0,
      feeTotal: fiatAmount * (direction === 'on' ? 0.05 : 0.04),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async createOnRamp(params: OnRampParams): Promise<RampResult> {
    const quote = await this.getQuote('on', params.fiatAmount, params.fiatCurrency, params.asset, params.network);
    return {
      id: `high_on_${Date.now()}`,
      direction: 'on',
      status: 'pending',
      quote,
      checkoutUrl: 'https://high.example.com/checkout',
      createdAt: new Date().toISOString(),
    };
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    const mockRate = 50000;
    const fiatAmount = params.cryptoAmount * mockRate;
    const quote = await this.getQuote('off', fiatAmount, params.fiatCurrency, params.asset, params.network);
    return {
      id: `high_off_${Date.now()}`,
      direction: 'off',
      status: 'pending',
      quote,
      depositAddress: '0xHIGH1234',
      createdAt: new Date().toISOString(),
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    return {
      id,
      direction: 'on',
      status: 'completed',
      quote: {
        fiatAmount: 1000,
        cryptoAmount: 0.02,
        rate: 50000,
        feeFixed: 0,
        feePercent: 5.0,
        feeTotal: 50,
        expiresAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhook(body: any): any {
    return body;
  }

  verifyWebhook(): boolean {
    return true;
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH'],
      supportedNetworks: ['BTC', 'ETH'],
      supportedFiat: ['USD', 'ZAR'],
      country: 'GLOBAL',
      kycRequired: false,
      fees: {
        onRampPercent: 5.0,
        offRampPercent: 4.0,
      },
      avgLatencyMs: 1500,
    };
  }
}

class FailingMockProvider extends CryptoRampProvider {
  readonly name = 'failing-mock';

  async getQuote(): Promise<RampQuote> {
    throw new Error('Provider unavailable');
  }

  async createOnRamp(): Promise<RampResult> {
    throw new Error('Provider unavailable');
  }

  async createOffRamp(): Promise<RampResult> {
    throw new Error('Provider unavailable');
  }

  async getRamp(): Promise<RampResult> {
    throw new Error('Provider unavailable');
  }

  parseWebhook(body: any): any {
    return body;
  }

  verifyWebhook(): boolean {
    return true;
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH'],
      supportedNetworks: ['BTC', 'ETH'],
      supportedFiat: ['USD', 'ZAR'],
      country: 'GLOBAL',
      kycRequired: false,
      fees: {
        onRampPercent: 1.0,
        offRampPercent: 0.5,
      },
    };
  }
}

class ExperimentalMockProvider extends CryptoRampProvider {
  readonly name = 'experimental-mock';

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    _fiatCurrency: string,
    _cryptoAsset: string,
    _network: string
  ): Promise<RampQuote> {
    return {
      fiatAmount,
      cryptoAmount: 0.01,
      rate: 50000,
      feeFixed: 0,
      feePercent: direction === 'on' ? 1.0 : 0.5,
      feeTotal: fiatAmount * (direction === 'on' ? 0.01 : 0.005),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async createOnRamp(params: OnRampParams): Promise<RampResult> {
    const quote = await this.getQuote('on', params.fiatAmount, params.fiatCurrency, params.asset, params.network);
    return {
      id: `exp_on_${Date.now()}`,
      direction: 'on',
      status: 'pending',
      quote,
      checkoutUrl: 'https://exp.example.com/checkout',
      createdAt: new Date().toISOString(),
    };
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    const mockRate = 50000;
    const fiatAmount = params.cryptoAmount * mockRate;
    const quote = await this.getQuote('off', fiatAmount, params.fiatCurrency, params.asset, params.network);
    return {
      id: `exp_off_${Date.now()}`,
      direction: 'off',
      status: 'pending',
      quote,
      depositAddress: '0xEXP1234',
      createdAt: new Date().toISOString(),
    };
  }

  async getRamp(id: string): Promise<RampResult> {
    return {
      id,
      direction: 'on',
      status: 'completed',
      quote: {
        fiatAmount: 1000,
        cryptoAmount: 0.02,
        rate: 50000,
        feeFixed: 0,
        feePercent: 1.0,
        feeTotal: 10,
        expiresAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhook(body: any): any {
    return body;
  }

  verifyWebhook(): boolean {
    return true;
  }

  getCapabilities(): CryptoRampCapabilities {
    return {
      supportedAssets: ['BTC', 'ETH'],
      supportedNetworks: ['BTC', 'ETH'],
      supportedFiat: ['USD', 'ZAR'],
      country: 'GLOBAL',
      kycRequired: false,
      experimental: true,
      fees: {
        onRampPercent: 1.0,
        offRampPercent: 0.5,
      },
    };
  }
}

describe('CryptoRampRouter', () => {
  it('should pick cheapest provider for off-ramp', async () => {
    const lowFee = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });

    class HighFeeCryptoRamp extends CryptoRamp {
      constructor() {
        super({ provider: 'mock', credentials: {}, sandbox: true });
        (this as any).provider = new HighFeeMockProvider();
      }
    }
    const highFee = new HighFeeCryptoRamp();

    const router = new CryptoRampRouter({
      providers: [
        { provider: highFee },
        { provider: lowFee },
      ],
      strategy: 'cheapest',
    });

    const result = await router.createOffRamp({
      cryptoAmount: 0.02,
      asset: 'BTC',
      network: 'BTC',
      fiatCurrency: 'ZAR',
      bankAccount: {
        accountNumber: '1234567890',
        branchCode: '123456',
        accountHolder: 'Test User',
        bankName: 'Test Bank',
      },
      customer: { name: 'Test', email: 'test@example.com' },
      reference: 'TEST-001',
    });

    assert.ok(result.routingMeta);
    assert.strictEqual(result.routingMeta.chosenProvider, 'mock');
    assert.strictEqual(result.routingMeta.strategy, 'cheapest');
  });

  it('should filter out experimental providers by default', async () => {
    const normal = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });

    class ExperimentalCryptoRamp extends CryptoRamp {
      constructor() {
        super({ provider: 'mock', credentials: {}, sandbox: true });
        (this as any).provider = new ExperimentalMockProvider();
      }
    }
    const experimental = new ExperimentalCryptoRamp();

    const router = new CryptoRampRouter({
      providers: [
        { provider: experimental },
        { provider: normal },
      ],
      strategy: 'cheapest',
    });

    const result = await router.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'BTC',
      network: 'BTC',
      destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'TEST-001',
    });

    assert.ok(result.routingMeta);
    assert.strictEqual(result.routingMeta.chosenProvider, 'mock');
  });

  it('should include experimental providers when allowExperimental is true', async () => {
    const normal = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });

    class ExperimentalCryptoRamp extends CryptoRamp {
      constructor() {
        super({ provider: 'mock', credentials: {}, sandbox: true });
        (this as any).provider = new ExperimentalMockProvider();
      }
    }
    const experimental = new ExperimentalCryptoRamp();

    const router = new CryptoRampRouter({
      providers: [
        { provider: experimental },
        { provider: normal },
      ],
      strategy: 'cheapest',
      allowExperimental: true,
    });

    const result = await router.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'BTC',
      network: 'BTC',
      destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'TEST-001',
    });

    assert.ok(result.routingMeta);
    assert.strictEqual(result.routingMeta.chosenProvider, 'experimental-mock');
  });

  it('should fallback to next provider on failure', async () => {
    class FailingCryptoRamp extends CryptoRamp {
      constructor() {
        super({ provider: 'mock', credentials: {}, sandbox: true });
        (this as any).provider = new FailingMockProvider();
      }
    }
    const failing = new FailingCryptoRamp();
    const working = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });

    const router = new CryptoRampRouter({
      providers: [
        { provider: failing },
        { provider: working },
      ],
      strategy: 'priority',
      fallback: { enabled: true, maxAttempts: 2, retryDelayMs: 10 },
    });

    const result = await router.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'BTC',
      network: 'BTC',
      destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'TEST-001',
    });

    assert.ok(result.routingMeta);
    assert.strictEqual(result.routingMeta.chosenProvider, 'mock');
    assert.strictEqual(result.routingMeta.attempts.length, 2);
    assert.strictEqual(result.routingMeta.attempts[0].status, 'failed');
    assert.strictEqual(result.routingMeta.attempts[1].status, 'success');
  });

  it('should throw RoutingError when all providers fail', async () => {
    class FailingCryptoRamp extends CryptoRamp {
      constructor() {
        super({ provider: 'mock', credentials: {}, sandbox: true });
        (this as any).provider = new FailingMockProvider();
      }
    }
    const failing = new FailingCryptoRamp();

    const router = new CryptoRampRouter({
      providers: [{ provider: failing }],
      strategy: 'cheapest',
      fallback: { enabled: true, maxAttempts: 1, retryDelayMs: 10 },
    });

    try {
      await router.createOnRamp({
        fiatAmount: 1000,
        fiatCurrency: 'ZAR',
        asset: 'BTC',
        network: 'BTC',
        destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
        reference: 'TEST-001',
      });
      assert.fail('Should have thrown RoutingError');
    } catch (error: any) {
      assert.strictEqual(error.name, 'RoutingError');
      assert.ok(error.attempts);
      assert.strictEqual(error.attempts.length, 1);
      assert.strictEqual(error.attempts[0].status, 'failed');
    }
  });

  it('should maintain separate round-robin state per instance', () => {
    const provider1 = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });
    const provider2 = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });

    const router1 = new CryptoRampRouter({
      providers: [{ provider: provider1 }, { provider: provider2 }],
      strategy: 'round-robin',
    });

    const router2 = new CryptoRampRouter({
      providers: [{ provider: provider1 }, { provider: provider2 }],
      strategy: 'round-robin',
    });

    assert.notStrictEqual(router1, router2);
  });

  it('should reject negative amount at createOnRamp', async () => {
    const provider = new CryptoRamp({ provider: 'mock', credentials: {}, sandbox: true });
    const router = new CryptoRampRouter({
      providers: [{ provider }],
      strategy: 'cheapest',
    });

    try {
      await router.createOnRamp({
        fiatAmount: -100,
        fiatCurrency: 'ZAR',
        asset: 'BTC',
        network: 'BTC',
        destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
        reference: 'TEST-NEG',
      });
      assert.fail('Should have thrown for negative amount');
    } catch (error: any) {
      assert.ok(error.message.includes('Invalid amount'));
    }
  });

  it('should use fastest strategy (lowest avgLatencyMs)', async () => {
    class FastProvider extends CryptoRampProvider {
      readonly name = 'fast-provider';

      async getQuote(direction: 'on' | 'off', fiatAmount: number): Promise<RampQuote> {
        return {
          fiatAmount,
          cryptoAmount: 0.01,
          rate: 50000,
          feeFixed: 0,
          feePercent: 2.0,
          feeTotal: fiatAmount * 0.02,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        };
      }

      async createOnRamp(params: OnRampParams): Promise<RampResult> {
        const quote = await this.getQuote('on', params.fiatAmount);
        return {
          id: 'fast_on_1',
          direction: 'on',
          status: 'pending',
          quote,
          checkoutUrl: 'https://fast.example.com',
          createdAt: new Date().toISOString(),
        };
      }

      async createOffRamp(params: OffRampParams): Promise<RampResult> {
        const fiatAmount = params.cryptoAmount * 50000;
        const quote = await this.getQuote('off', fiatAmount);
        return {
          id: 'fast_off_1',
          direction: 'off',
          status: 'pending',
          quote,
          depositAddress: '0xFAST',
          createdAt: new Date().toISOString(),
        };
      }

      async getRamp(id: string): Promise<RampResult> {
        throw new Error('Not implemented');
      }

      parseWebhook(body: any): any {
        return body;
      }

      verifyWebhook(): boolean {
        return true;
      }

      getCapabilities(): CryptoRampCapabilities {
        return {
          supportedAssets: ['BTC', 'ETH'],
          supportedNetworks: ['BTC', 'ETH'],
          supportedFiat: ['USD', 'ZAR'],
          country: 'GLOBAL',
          kycRequired: false,
          fees: { onRampPercent: 2.0, offRampPercent: 2.0 },
          avgLatencyMs: 500,
        };
      }
    }

    class SlowProvider extends CryptoRampProvider {
      readonly name = 'slow-provider';

      async getQuote(direction: 'on' | 'off', fiatAmount: number): Promise<RampQuote> {
        return {
          fiatAmount,
          cryptoAmount: 0.01,
          rate: 50000,
          feeFixed: 0,
          feePercent: 1.0,
          feeTotal: fiatAmount * 0.01,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        };
      }

      async createOnRamp(): Promise<RampResult> {
        throw new Error('Should not be called');
      }

      async createOffRamp(): Promise<RampResult> {
        throw new Error('Should not be called');
      }

      async getRamp(): Promise<RampResult> {
        throw new Error('Not implemented');
      }

      parseWebhook(body: any): any {
        return body;
      }

      verifyWebhook(): boolean {
        return true;
      }

      getCapabilities(): CryptoRampCapabilities {
        return {
          supportedAssets: ['BTC', 'ETH'],
          supportedNetworks: ['BTC', 'ETH'],
          supportedFiat: ['USD', 'ZAR'],
          country: 'GLOBAL',
          kycRequired: false,
          fees: { onRampPercent: 1.0, offRampPercent: 1.0 },
          avgLatencyMs: 2000,
        };
      }
    }

    const fast = new CryptoRamp({ provider: new FastProvider() });
    const slow = new CryptoRamp({ provider: new SlowProvider() });

    const router = new CryptoRampRouter({
      providers: [{ provider: slow }, { provider: fast }],
      strategy: 'fastest',
      fallback: { enabled: false },
    });

    const result = await router.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'BTC',
      network: 'BTC',
      destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'TEST-FASTEST',
    });

    assert.strictEqual(result.routingMeta?.chosenProvider, 'fast-provider');
  });

  it('should sort providers with undefined latency last in fastest strategy', async () => {
    class NoLatencyProvider extends CryptoRampProvider {
      readonly name = 'no-latency';

      async getQuote(): Promise<RampQuote> {
        throw new Error('Should not be called');
      }

      async createOnRamp(): Promise<RampResult> {
        throw new Error('Should not be called');
      }

      async createOffRamp(): Promise<RampResult> {
        throw new Error('Should not be called');
      }

      async getRamp(): Promise<RampResult> {
        throw new Error('Not implemented');
      }

      parseWebhook(body: any): any {
        return body;
      }

      verifyWebhook(): boolean {
        return true;
      }

      getCapabilities(): CryptoRampCapabilities {
        return {
          supportedAssets: ['BTC'],
          supportedNetworks: ['BTC'],
          supportedFiat: ['ZAR'],
          country: 'GLOBAL',
          kycRequired: false,
          fees: { onRampPercent: 1.0, offRampPercent: 1.0 },
        };
      }
    }

    class HasLatencyProvider extends CryptoRampProvider {
      readonly name = 'has-latency';

      async getQuote(direction: 'on' | 'off', fiatAmount: number): Promise<RampQuote> {
        return {
          fiatAmount,
          cryptoAmount: 0.01,
          rate: 50000,
          feeFixed: 0,
          feePercent: 2.0,
          feeTotal: fiatAmount * 0.02,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        };
      }

      async createOnRamp(params: OnRampParams): Promise<RampResult> {
        const quote = await this.getQuote('on', params.fiatAmount);
        return {
          id: 'has_lat_1',
          direction: 'on',
          status: 'pending',
          quote,
          checkoutUrl: 'https://haslatency.example.com',
          createdAt: new Date().toISOString(),
        };
      }

      async createOffRamp(): Promise<RampResult> {
        throw new Error('Not implemented');
      }

      async getRamp(): Promise<RampResult> {
        throw new Error('Not implemented');
      }

      parseWebhook(body: any): any {
        return body;
      }

      verifyWebhook(): boolean {
        return true;
      }

      getCapabilities(): CryptoRampCapabilities {
        return {
          supportedAssets: ['BTC'],
          supportedNetworks: ['BTC'],
          supportedFiat: ['ZAR'],
          country: 'GLOBAL',
          kycRequired: false,
          fees: { onRampPercent: 2.0, offRampPercent: 2.0 },
          avgLatencyMs: 1000,
        };
      }
    }

    const noLatency = new CryptoRamp({ provider: new NoLatencyProvider() });
    const hasLatency = new CryptoRamp({ provider: new HasLatencyProvider() });

    const router = new CryptoRampRouter({
      providers: [{ provider: noLatency }, { provider: hasLatency }],
      strategy: 'fastest',
      fallback: { enabled: false },
    });

    const result = await router.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'BTC',
      network: 'BTC',
      destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'TEST-LATENCY-SORT',
    });

    assert.strictEqual(result.routingMeta?.chosenProvider, 'has-latency');
  });
});
