/**
 * Ramp Network crypto provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { RampProvider } from '../../src/crypto/ramp';

describe('RampProvider', () => {
  let provider: RampProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new RampProvider({
      hostApiKey: 'test_host_key_abc123',
      webhookSecret: 'whsec_test123',
      sandbox: true,
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create onRamp with hostApiKey and swapAsset', async () => {
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
    assert.ok(ramp.checkoutUrl?.includes('hostApiKey=test_host_key_abc123'));
    assert.ok(ramp.checkoutUrl?.includes('swapAsset=USDT_POLYGON'));
    assert.ok(ramp.checkoutUrl?.includes('fiatCurrency=ZAR'));
  });

  it('should create offRamp with defaultFlow=OFFRAMP', async () => {
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
    assert.ok(ramp.checkoutUrl?.includes('defaultFlow=OFFRAMP'));
  });

  it('should getRamp from API endpoint', async () => {
    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'PURCHASE123',
          type: 'ONRAMP',
          status: 'RELEASED',
          fiatValue: 1000,
          cryptoAmount: 0.05,
          assetExchangeRate: 20000,
          appliedFee: 29.0,
          cryptoTxHash: '0xabc123',
          createdAt: '2026-05-04T10:00:00.000Z',
        }),
      } as any as Response;
    };

    const ramp = await provider.getRamp('PURCHASE123');

    assert.strictEqual(ramp.status, 'completed');
    assert.strictEqual(ramp.direction, 'on');
  });

  it('should verify valid HMAC-SHA256 hex webhook signature (placeholder)', () => {
    const payload = JSON.stringify({ type: 'CREATED', purchase: {} });

    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(payload)
      .digest('hex');

    const headers = {
      'x-body-signature': signature,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should have TODO(verify) marker in verifyWebhook code', () => {
    const fs = require('fs');
    const path = require('path');
    const code = fs.readFileSync(path.resolve(__dirname, '../../../src/crypto/ramp.ts'), 'utf8');
    assert.ok(code.includes('TODO(verify)'), 'Should contain TODO(verify) for ECDSA migration');
  });

  it('should throw on invalid wallet address', async () => {
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

    assert.deepStrictEqual(caps.supportedAssets, ['BTC', 'ETH', 'USDT', 'USDC', 'DAI', 'MATIC']);
    assert.deepStrictEqual(caps.supportedNetworks, ['BTC', 'ETH', 'POLYGON', 'BSC']);
    assert.strictEqual(caps.kycRequired, true);
    assert.strictEqual(caps.fees.onRampPercent, 2.9);
    assert.strictEqual(caps.fees.offRampPercent, 1.9);
  });
});
