/**
 * MoonPay quote endpoint tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MoonPayProvider } from '../../src/crypto/moonpay';

describe('MoonPay quote endpoint selection', () => {
  let provider: MoonPayProvider;
  let originalFetch: typeof globalThis.fetch;
  let capturedUrls: string[] = [];

  beforeEach(() => {
    provider = new MoonPayProvider({
      apiKey: 'pk_test_123',
      secretKey: 'sk_test_456',
      sandbox: true,
    });

    originalFetch = globalThis.fetch;
    capturedUrls = [];

    (globalThis as any).fetch = async (url: string) => {
      capturedUrls.push(url);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          quoteCurrencyAmount: 0.0025,
          quoteCurrencyPrice: 40000,
          feeAmount: 5.0,
        }),
      } as Response;
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getQuote("on", ...) calls /v3/currencies/{asset}/quote', async () => {
    await provider.getQuote('on', 100, 'USD', 'btc', 'BTC');

    assert.strictEqual(capturedUrls.length, 1);
    assert.ok(capturedUrls[0].includes('/v3/currencies/btc/quote?'));
    assert.ok(capturedUrls[0].includes('baseCurrencyCode=usd'));
    assert.ok(capturedUrls[0].includes('quoteCurrencyCode=btc'));
    assert.ok(capturedUrls[0].includes('baseCurrencyAmount=100'));
  });

  it('getQuote("off", ...) calls /v3/currencies/{asset}/sell_quote', async () => {
    await provider.getQuote('off', 0.005, 'USD', 'btc', 'BTC');

    assert.strictEqual(capturedUrls.length, 1);
    assert.ok(capturedUrls[0].includes('/v3/currencies/btc/sell_quote?'));
  });

  it('off-ramp uses baseCurrencyCode = crypto, quoteCurrencyCode = fiat', async () => {
    await provider.getQuote('off', 0.005, 'ZAR', 'usdc', 'POLYGON');

    assert.strictEqual(capturedUrls.length, 1);
    const url = capturedUrls[0];
    assert.ok(url.includes('baseCurrencyCode=usdc'));
    assert.ok(url.includes('quoteCurrencyCode=zar'));
    assert.ok(url.includes('baseCurrencyAmount=0.005'));
  });

  it('on-ramp uses baseCurrencyCode = fiat, quoteCurrencyCode = crypto', async () => {
    await provider.getQuote('on', 500, 'EUR', 'eth', 'ETH');

    assert.strictEqual(capturedUrls.length, 1);
    const url = capturedUrls[0];
    assert.ok(url.includes('baseCurrencyCode=eur'));
    assert.ok(url.includes('quoteCurrencyCode=eth'));
    assert.ok(url.includes('baseCurrencyAmount=500'));
  });
});
