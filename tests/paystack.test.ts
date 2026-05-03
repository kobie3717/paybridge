/**
 * PayStack provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { PayStackProvider } from '../src/providers/paystack';
import { toMinorUnit } from '../src/utils/currency';

describe('PayStackProvider', () => {
  let provider: PayStackProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new PayStackProvider({
      apiKey: 'sk_test_123456789',
      webhookSecret: 'unused',
      sandbox: true,
    });

    mockResponses = new Map();
    originalFetch = globalThis.fetch;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const key = `${options?.method || 'GET'} ${url}`;
      const mockResponse = mockResponses.get(key);

      if (!mockResponse) {
        throw new Error(`No mock response for: ${key}`);
      }

      return {
        ok: mockResponse.ok ?? true,
        status: mockResponse.status ?? 200,
        headers: new Map([['content-type', 'application/json']]) as any,
        json: async () => mockResponse.data,
        text: async () => JSON.stringify(mockResponse.data),
      } as any as Response;
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create payment with correct JSON body', async () => {
    let capturedBody: any = null;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body ? JSON.parse(options.body) : null;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          message: 'Authorization URL created',
          data: {
            authorization_url: 'https://checkout.paystack.com/abc123',
            access_code: 'abc123',
            reference: 'INV-001',
          },
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'NGN',
      reference: 'INV-001',
      description: 'Test Payment',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(payment.id, 'INV-001');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'NGN');
    assert.strictEqual(payment.checkoutUrl, 'https://checkout.paystack.com/abc123');

    assert.ok(capturedBody);
    assert.strictEqual(capturedBody.email, 'john@example.com');
    assert.strictEqual(capturedBody.amount, 29900);
    assert.strictEqual(capturedBody.currency, 'NGN');
    assert.strictEqual(capturedBody.callback_url, 'https://example.com/success');
  });

  it('should create subscription with two-step flow', async () => {
    const fetchCalls: Array<{ url: string; method: string; body: any }> = [];

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const body = options?.body ? JSON.parse(options.body) : null;
      fetchCalls.push({ url, method: options?.method || 'GET', body });

      if (url.includes('/plan')) {
        assert.strictEqual(body.name, 'Monthly Subscription');
        assert.strictEqual(body.amount, 29900);
        assert.strictEqual(body.interval, 'monthly');
        assert.strictEqual(body.currency, 'NGN');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              plan_code: 'PLN_abc123',
            },
          }),
        } as any as Response;
      } else if (url.includes('/transaction/initialize')) {
        assert.strictEqual(body.plan, 'PLN_abc123');
        assert.strictEqual(body.email, 'jane@example.com');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/sub123',
              reference: 'SUB_REF_001',
            },
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const subscription = await provider.createSubscription({
      amount: 299.0,
      currency: 'NGN',
      interval: 'monthly',
      reference: 'SUB-001',
      description: 'Monthly Subscription',
      customer: {
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(subscription.id, 'SUB_REF_001');
    assert.strictEqual(subscription.status, 'pending');
    assert.strictEqual(subscription.interval, 'monthly');
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].url.includes('/plan'));
    assert.ok(fetchCalls[1].url.includes('/transaction/initialize'));
  });

  it('should map yearly interval to annually', async () => {
    let capturedInterval = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const body = options?.body ? JSON.parse(options.body) : null;

      if (url.includes('/plan')) {
        capturedInterval = body.interval;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: { plan_code: 'PLN_yearly' },
          }),
        } as any as Response;
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/yearly',
              reference: 'SUB_YEARLY',
            },
          }),
        } as any as Response;
      }
    };

    await provider.createSubscription({
      amount: 999.0,
      currency: 'NGN',
      interval: 'yearly',
      reference: 'SUB-YEARLY',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(capturedInterval, 'annually');
  });

  it('should map status=success to completed', async () => {
    mockResponses.set('GET https://api.paystack.co/transaction/verify/ref_123', {
      data: {
        status: true,
        data: {
          reference: 'ref_123',
          status: 'success',
          amount: 29900,
          currency: 'NGN',
          created_at: '2026-05-03T10:00:00Z',
        },
      },
    });

    const payment = await provider.getPayment('ref_123');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
  });

  it('should map status=failed to failed', async () => {
    mockResponses.set('GET https://api.paystack.co/transaction/verify/ref_456', {
      data: {
        status: true,
        data: {
          reference: 'ref_456',
          status: 'failed',
          amount: 10000,
          currency: 'NGN',
          created_at: '2026-05-03T10:00:00Z',
        },
      },
    });

    const payment = await provider.getPayment('ref_456');

    assert.strictEqual(payment.status, 'failed');
  });

  it('should map status=abandoned to cancelled', async () => {
    mockResponses.set('GET https://api.paystack.co/transaction/verify/ref_789', {
      data: {
        status: true,
        data: {
          reference: 'ref_789',
          status: 'abandoned',
          amount: 50000,
          currency: 'NGN',
          created_at: '2026-05-03T10:00:00Z',
        },
      },
    });

    const payment = await provider.getPayment('ref_789');

    assert.strictEqual(payment.status, 'cancelled');
  });

  it('should refund with transaction field', async () => {
    let capturedBody: any = null;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body ? JSON.parse(options.body) : null;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: {
            id: 12345,
            reference: 'ref_refund_123',
            status: 'processed',
            amount: 29900,
            currency: 'NGN',
            created_at: '2026-05-03T11:00:00Z',
          },
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'ref_original_123',
      amount: 299.0,
      reason: 'Customer request',
    });

    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(refund.amount, 299.0);
    assert.ok(capturedBody);
    assert.strictEqual(capturedBody.transaction, 'ref_original_123');
    assert.strictEqual(capturedBody.amount, 29900);
    assert.strictEqual(capturedBody.merchant_note, 'Customer request');
  });

  it('should verify valid webhook signature with SHA-512', () => {
    const payload = JSON.stringify({ event: 'charge.success', data: {} });

    const signature = crypto
      .createHmac('sha512', 'sk_test_123456789')
      .update(payload)
      .digest('hex');

    const headers = {
      'x-paystack-signature': signature,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with missing secret', () => {
    const providerNoSecret = new PayStackProvider({
      apiKey: '',
      sandbox: true,
    });

    const payload = JSON.stringify({ event: 'charge.success' });
    const headers = { 'x-paystack-signature': 'abc123' };

    const isValid = providerNoSecret.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with missing header', () => {
    const payload = JSON.stringify({ event: 'charge.success' });

    const isValid = provider.verifyWebhook(payload, {});
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with wrong signature', () => {
    const payload = JSON.stringify({ event: 'charge.success' });

    const headers = {
      'x-paystack-signature': 'wrong_signature_123',
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with tampered body', () => {
    const originalPayload = JSON.stringify({ event: 'charge.success', amount: 100 });
    const tamperedPayload = JSON.stringify({ event: 'charge.success', amount: 999 });

    const signature = crypto
      .createHmac('sha512', 'sk_test_123456789')
      .update(originalPayload)
      .digest('hex');

    const headers = {
      'x-paystack-signature': signature,
    };

    const isValid = provider.verifyWebhook(tamperedPayload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should parse charge.success webhook', () => {
    const event = {
      event: 'charge.success',
      data: {
        reference: 'ref_webhook_123',
        amount: 29900,
        currency: 'NGN',
        paid_at: '2026-05-03T12:00:00Z',
      },
    };

    const webhookEvent = provider.parseWebhook(event);

    assert.strictEqual(webhookEvent.type, 'payment.completed');
    assert.strictEqual(webhookEvent.payment?.id, 'ref_webhook_123');
    assert.strictEqual(webhookEvent.payment?.status, 'completed');
    assert.strictEqual(webhookEvent.payment?.amount, 299.0);
  });

  it('should parse subscription.create webhook', () => {
    const event = {
      event: 'subscription.create',
      data: {
        subscription_code: 'SUB_abc123',
        amount: 50000,
        currency: 'NGN',
        created_at: '2026-05-03T12:00:00Z',
      },
    };

    const webhookEvent = provider.parseWebhook(event);

    assert.strictEqual(webhookEvent.type, 'subscription.created');
    assert.strictEqual(webhookEvent.subscription?.id, 'SUB_abc123');
    assert.strictEqual(webhookEvent.subscription?.status, 'active');
  });

  it('should throw on unsupported currency', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'EUR',
          reference: 'TEST',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      {
        name: 'Error',
        message: /Currency EUR not supported/,
      }
    );
  });

  it('should return capabilities with NGN fees', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 100);
    assert.strictEqual(caps.fees.percent, 1.5);
    assert.strictEqual(caps.fees.currency, 'NGN');
    assert.strictEqual(caps.country, 'NG');
    assert.strictEqual(caps.avgLatencyMs, 600);
    assert.deepStrictEqual(caps.currencies, ['NGN', 'GHS', 'ZAR', 'USD', 'KES']);
  });

  // ==================== Group A: Refund tests ====================

  it('should refund without amount (full refund)', async () => {
    let capturedBody: any = null;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body ? JSON.parse(options.body) : null;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: {
            id: 99999,
            reference: 'ref_full_refund',
            status: 'processed',
            amount: 50000,
            currency: 'NGN',
          },
        }),
      } as any as Response;
    };

    await provider.refund({
      paymentId: 'ref_orig_123',
    });

    assert.ok(capturedBody);
    assert.strictEqual(capturedBody.transaction, 'ref_orig_123');
    assert.strictEqual(capturedBody.amount, undefined); // Full refund, no amount
  });

  it('should include merchant_note when reason provided', async () => {
    let capturedBody: any = null;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body ? JSON.parse(options.body) : null;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: {
            id: 12345,
            reference: 'ref_reason',
            status: 'processed',
            amount: 10000,
            currency: 'NGN',
          },
        }),
      } as any as Response;
    };

    await provider.refund({
      paymentId: 'ref_orig_456',
      amount: 100.0,
      reason: 'Defective product',
    });

    assert.strictEqual(capturedBody.merchant_note, 'Defective product');
  });

  // ==================== Group B: Error path tests ====================

  it('should throw on 400 with error message from body', async () => {
    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          status: false,
          message: 'Invalid email format',
        }),
        text: async () => JSON.stringify({
          status: false,
          message: 'Invalid email format',
        }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'ERR-400',
          customer: { name: 'Test', email: 'invalid' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      (err: any) => {
        // PayStack throws plain Error with message from response
        assert.ok(err.message.includes('Invalid email'));
        return true;
      }
    );
  });

  it('should throw on 500 response', async () => {
    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'Internal Server Error',
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'ERR-500',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /500/
    );
  });

  it('should propagate FetchTimeoutError', async () => {
    const { FetchTimeoutError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async () => {
      throw new FetchTimeoutError('https://api.paystack.co/transaction/initialize', 30000);
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'TIMEOUT',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      FetchTimeoutError
    );
  });

  it('should throw on 429 rate limit', async () => {
    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: false, message: 'Rate limit exceeded' }),
        text: async () => JSON.stringify({ status: false, message: 'Rate limit exceeded' }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'RATE-LIMIT',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /Rate limit exceeded/
    );
  });

  // ==================== Group D: Webhook - NO timestamp validation ====================

  it('should accept webhook without timestamp validation (no replay protection)', () => {
    // PayStack uses HMAC-SHA512 on body only, NO timestamp check
    const payload = JSON.stringify({ event: 'charge.success', data: { amount: 10000 } });

    const signature = crypto
      .createHmac('sha512', 'sk_test_123456789')
      .update(payload)
      .digest('hex');

    const headers = {
      'x-paystack-signature': signature,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);

    // Verify that even a very old webhook would be accepted (no timestamp in signature)
    // This is a documented limitation of PayStack's webhook design
  });

  // ==================== Group E: Currency edge cases ====================
  // Note: Amount validation (0, negative, NaN, Infinity) is done by the Router, not providers.

  it('should throw on lowercase currency (case-sensitive validation)', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'ngn',
          reference: 'LOWER',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /Currency ngn not supported/
    );
  });
});
