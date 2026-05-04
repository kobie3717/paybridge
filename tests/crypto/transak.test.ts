/**
 * Transak crypto provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { TransakProvider } from '../../src/crypto/transak';

describe('TransakProvider', () => {
  let provider: TransakProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new TransakProvider({
      apiKey: 'pk_test_abc123',
      apiSecret: 'sk_test_secret123',
      sandbox: true,
      webhookSecret: 'whsec_test123',
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create onRamp with signed widget URL', async () => {
    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            cryptoAmount: 0.05,
            totalFee: 20.0,
          },
        }),
      } as any as Response;
    };

    const ramp = await provider.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'USDT',
      network: 'POLYGON',
      destinationWallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbC',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'RAMP-001',
    });

    assert.strictEqual(ramp.direction, 'on');
    assert.strictEqual(ramp.status, 'pending');
    assert.ok(ramp.checkoutUrl?.includes('apiKey=pk_test_abc123'));
    assert.ok(ramp.checkoutUrl?.includes('fiatAmount=1000'));
    assert.ok(ramp.checkoutUrl?.includes('cryptoCurrencyCode=USDT'));
    assert.ok(ramp.checkoutUrl?.includes('signature='));
  });

  it('should sign widget URL with HMAC-SHA256 base64', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: { cryptoAmount: 0.05, totalFee: 20.0 } }),
      } as any as Response;
    };

    const ramp = await provider.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'USDT',
      network: 'POLYGON',
      destinationWallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbC',
      customer: { name: 'John Doe', email: 'john@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'RAMP-001',
    });

    const url = new URL(ramp.checkoutUrl!);
    const signature = url.searchParams.get('signature');
    url.searchParams.delete('signature');

    const queryString = url.search.slice(1);
    const expectedSignature = crypto
      .createHmac('sha256', 'sk_test_secret123')
      .update(queryString)
      .digest('base64');

    assert.strictEqual(signature, expectedSignature);
  });

  it('should create offRamp with productsAvailed=SELL', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: { cryptoAmount: 0.05, totalFee: 20.0 } }),
      } as any as Response;
    };

    const ramp = await provider.createOffRamp({
      cryptoAmount: 0.05,
      asset: 'USDT',
      network: 'POLYGON',
      fiatCurrency: 'ZAR',
      bankAccount: {
        accountNumber: '1234567890',
        branchCode: '123456',
        accountHolder: 'John Doe',
        bankName: 'Test Bank',
      },
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      reference: 'OFFRAMP-001',
    });

    assert.strictEqual(ramp.direction, 'off');
    assert.ok(ramp.checkoutUrl?.includes('productsAvailed=SELL'));
  });

  it('should getRamp with api-secret header', async () => {
    let capturedHeaders: any = {};

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedHeaders = options?.headers || {};

      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            id: 'ORDER123',
            status: 'COMPLETED',
            isBuyOrSell: 'BUY',
            fiatAmount: 1000,
            cryptoAmount: 0.05,
            conversionPrice: 20000,
            totalFee: 20.0,
            transactionHash: '0xabc123',
            createdAt: '2026-05-04T10:00:00.000Z',
          },
        }),
      } as any as Response;
    };

    const ramp = await provider.getRamp('ORDER123');

    assert.strictEqual(ramp.status, 'completed');
    assert.strictEqual(ramp.direction, 'on');
    assert.strictEqual(capturedHeaders['api-secret'], 'sk_test_secret123');
  });

  it('should verify valid HMAC-SHA256 hex webhook signature', () => {
    const payload = JSON.stringify({ eventName: 'ORDER_COMPLETED', data: {} });

    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(payload)
      .digest('hex');

    const headers = {
      'x-transak-signature': signature,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ eventName: 'ORDER_COMPLETED' });
    const headers = { 'x-transak-signature': 'invalid_signature' };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should throw on invalid wallet address', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: { cryptoAmount: 0.05, totalFee: 20.0 } }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createOnRamp({
          fiatAmount: 1000,
          fiatCurrency: 'ZAR',
          asset: 'USDT',
          network: 'POLYGON',
          destinationWallet: 'invalid_address',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
          reference: 'RAMP-001',
        });
      },
      /Invalid POLYGON wallet address/
    );
  });

  it('should return capabilities with supported assets', () => {
    const caps = provider.getCapabilities();

    assert.deepStrictEqual(caps.supportedAssets, ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'BNB']);
    assert.deepStrictEqual(caps.supportedNetworks, ['BTC', 'ETH', 'POLYGON', 'BSC', 'TRON']);
    assert.strictEqual(caps.kycRequired, true);
    assert.strictEqual(caps.fees.onRampPercent, 2.0);
    assert.strictEqual(caps.fees.offRampPercent, 1.5);
  });
});
