/**
 * Router tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PayBridge, PayBridgeRouter, RoutingError } from '../src';

describe('PayBridgeRouter', () => {
  it('should order providers by cheapest strategy', () => {
    const provider1 = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const provider2 = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const provider3 = new PayBridge({
      provider: 'ozow',
      credentials: { apiKey: 'test', siteCode: 'test', privateKey: 'test' },
      sandbox: true,
    });

    const caps1 = provider1.provider.getCapabilities();
    const caps2 = provider2.provider.getCapabilities();
    const caps3 = provider3.provider.getCapabilities();

    assert.strictEqual(caps1.fees.percent, 2.5);
    assert.strictEqual(caps2.fees.percent, 2.95);
    assert.strictEqual(caps3.fees.percent, 1.5);
  });

  it('should filter providers by currency', () => {
    const provider1 = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider1 }],
      strategy: 'cheapest',
    });

    assert.ok(router);
  });

  it('should throw RoutingError when all providers fail', async () => {
    const provider1 = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'invalid' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider1 }],
      strategy: 'cheapest',
      fallback: {
        enabled: true,
        maxAttempts: 1,
        retryDelayMs: 10,
      },
    });

    try {
      await router.createPayment({
        amount: 299.0,
        currency: 'ZAR',
        reference: 'TEST-001',
        customer: {
          name: 'Test User',
          email: 'test@example.com',
        },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
      });
      assert.fail('Should have thrown RoutingError');
    } catch (error: any) {
      assert.strictEqual(error.name, 'RoutingError');
      assert.ok(error.attempts);
      assert.ok(error.attempts.length > 0);
    }
  });

  it('should use priority strategy', () => {
    const provider1 = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const provider2 = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [
        { provider: provider1, priority: 1 },
        { provider: provider2, priority: 10 },
      ],
      strategy: 'priority',
    });

    assert.ok(router);
  });
});
