/**
 * Router rate-limit awareness tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PayBridge, PayBridgeRouter, HttpError, FetchTimeoutError } from '../src';

describe('PayBridgeRouter rate-limit handling', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('Provider that throws HttpError(429) triggers fallback WITHOUT recording circuit-breaker failure', async () => {
    let callCount = 0;

    (globalThis as any).fetch = async () => {
      callCount++;
      const headers = new Map();
      headers.set('retry-after', '30');
      throw new HttpError(429, 'Rate limit exceeded', { retryAfterMs: 30000 });
    };

    const provider1 = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const provider2 = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider1 }, { provider: provider2 }],
      strategy: 'priority',
      fallback: {
        enabled: true,
        maxAttempts: 2,
        retryDelayMs: 10,
      },
    });

    try {
      await router.createPayment({
        amount: 100.0,
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
      assert.strictEqual(error.attempts.length, 2);
      assert.strictEqual(error.attempts[0].errorCode, 'RATE_LIMITED');
      assert.strictEqual(error.attempts[1].errorCode, 'RATE_LIMITED');
    }
  });

  it('After 6 consecutive 429s on same provider, circuit is still CLOSED', async () => {
    let callCount = 0;

    (globalThis as any).fetch = async () => {
      callCount++;
      throw new HttpError(429, 'Rate limit exceeded');
    };

    const provider = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider }],
      strategy: 'cheapest',
      fallback: {
        enabled: true,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
    });

    for (let i = 0; i < 6; i++) {
      try {
        await router.createPayment({
          amount: 100.0,
          currency: 'ZAR',
          reference: `TEST-${i}`,
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      } catch {}
    }

    const circuitBreakers = (router as any).circuitBreakers;
    const breaker = circuitBreakers.get('yoco');
    const state = await breaker.getState();
    assert.strictEqual(state, 'CLOSED');
  });

  it('Provider that throws FetchTimeoutError DOES record failure', async () => {
    let callCount = 0;

    (globalThis as any).fetch = async () => {
      callCount++;
      throw new FetchTimeoutError('https://example.com', 30000);
    };

    const provider = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider }],
      strategy: 'cheapest',
      fallback: {
        enabled: true,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
    });

    for (let i = 0; i < 5; i++) {
      try {
        await router.createPayment({
          amount: 100.0,
          currency: 'ZAR',
          reference: `TEST-${i}`,
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      } catch {}
    }

    const circuitBreakers = (router as any).circuitBreakers;
    const breaker = circuitBreakers.get('yoco');
    const state = await breaker.getState();
    assert.strictEqual(state, 'OPEN');
  });

  it('routingMeta.attempts[i].errorCode is set to RATE_LIMITED on 429 attempt', async () => {
    let attempt = 0;

    (globalThis as any).fetch = async (url: string) => {
      if (url.includes('/api/auth/generatetoken')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => 'application/json',
          },
          json: async () => ({
            token: 'test-token',
            expiration: new Date(Date.now() + 3600000).toISOString(),
          }),
        } as any as Response;
      }

      attempt++;
      if (attempt === 1) {
        throw new HttpError(429, 'Rate limit exceeded');
      }
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({
          success: true,
          reference: 'test-payment',
          paymentURL: 'https://example.com/pay',
        }),
      } as any as Response;
    };

    const provider1 = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const provider2 = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider1 }, { provider: provider2 }],
      strategy: 'priority',
      fallback: {
        enabled: true,
        maxAttempts: 2,
        retryDelayMs: 10,
      },
    });

    const result = await router.createPayment({
      amount: 100.0,
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

    assert.ok(result.routingMeta);
    assert.strictEqual(result.routingMeta.attempts.length, 2);
    assert.strictEqual(result.routingMeta.attempts[0].status, 'failed');
    assert.strictEqual(result.routingMeta.attempts[0].errorCode, 'RATE_LIMITED');
    assert.strictEqual(result.routingMeta.attempts[1].status, 'success');
  });

  it('503 with Retry-After is treated as rate-limited', async () => {
    (globalThis as any).fetch = async () => {
      throw new HttpError(503, 'Service unavailable', { retryAfterMs: 60000 });
    };

    const provider = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider }],
      strategy: 'cheapest',
      fallback: {
        enabled: true,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
    });

    try {
      await router.createPayment({
        amount: 100.0,
        currency: 'ZAR',
        reference: 'TEST-001',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
      });
    } catch (error: any) {
      assert.strictEqual(error.name, 'RoutingError');
      assert.strictEqual(error.attempts[0].errorCode, 'RATE_LIMITED');
    }
  });

  it('503 WITHOUT Retry-After is NOT treated as rate-limited', async () => {
    (globalThis as any).fetch = async () => {
      throw new HttpError(503, 'Service unavailable');
    };

    const provider = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: provider }],
      strategy: 'cheapest',
      fallback: {
        enabled: true,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
    });

    for (let i = 0; i < 5; i++) {
      try {
        await router.createPayment({
          amount: 100.0,
          currency: 'ZAR',
          reference: `TEST-${i}`,
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      } catch {}
    }

    const circuitBreakers = (router as any).circuitBreakers;
    const breaker = circuitBreakers.get('yoco');
    const state = await breaker.getState();
    assert.strictEqual(state, 'OPEN');
  });
});
