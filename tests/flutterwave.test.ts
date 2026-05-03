/**
 * Flutterwave provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { FlutterwaveProvider } from '../src/providers/flutterwave';

describe('FlutterwaveProvider', () => {
  let provider: FlutterwaveProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new FlutterwaveProvider({
      apiKey: 'FLWSECK_TEST-abc123-X',
      webhookSecret: 'test-webhook-secret-123',
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
      if (options?.body) {
        capturedBody = JSON.parse(options.body);
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Hosted Link',
          data: {
            link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc123',
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
        phone: '08012345678',
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
    assert.strictEqual(payment.checkoutUrl, 'https://checkout.flutterwave.com/v3/hosted/pay/abc123');

    assert.ok(capturedBody);
    assert.strictEqual(capturedBody.tx_ref, 'INV-001');
    assert.strictEqual(capturedBody.amount, '299.00');
    assert.strictEqual(capturedBody.currency, 'NGN');
    assert.strictEqual(capturedBody.customer.email, 'john@example.com');
  });

  it('should return data.link as checkoutUrl', async () => {
    mockResponses.set('POST https://api.flutterwave.com/v3/payments', {
      data: {
        status: 'success',
        message: 'Hosted Link',
        data: {
          link: 'https://checkout.flutterwave.com/v3/hosted/pay/xyz789',
        },
      },
    });

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Hosted Link',
          data: {
            link: 'https://checkout.flutterwave.com/v3/hosted/pay/xyz789',
          },
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 100.0,
      currency: 'USD',
      reference: 'TEST-001',
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

    assert.strictEqual(payment.checkoutUrl, 'https://checkout.flutterwave.com/v3/hosted/pay/xyz789');
  });

  it('should throw when status !== success', async () => {
    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'error',
          message: 'Invalid amount',
        }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'TEST-002',
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
      },
      /Invalid amount/
    );
  });

  it('should create subscription with two-step process', async () => {
    const fetchCalls: string[] = [];
    let planPostBody: any = null;
    let paymentPostBody: any = null;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      fetchCalls.push(`${options?.method || 'GET'} ${url}`);

      if (url.includes('/payment-plans')) {
        planPostBody = JSON.parse(options?.body || '{}');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            message: 'Plan created',
            data: {
              id: 12345,
              name: 'Monthly Subscription',
            },
          }),
        } as any as Response;
      } else if (url.includes('/payments')) {
        paymentPostBody = JSON.parse(options?.body || '{}');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            message: 'Hosted Link',
            data: {
              link: 'https://checkout.flutterwave.com/v3/hosted/pay/sub123',
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

    assert.strictEqual(subscription.id, 'SUB-001');
    assert.strictEqual(subscription.status, 'pending');
    assert.strictEqual(subscription.interval, 'monthly');
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].includes('/payment-plans'));
    assert.ok(fetchCalls[1].includes('/payments'));

    assert.strictEqual(planPostBody.amount, 299);
    assert.strictEqual(planPostBody.interval, 'monthly');
    assert.strictEqual(paymentPostBody.payment_plan, 12345);
  });

  it('should get payment and map successful to completed', async () => {
    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      assert.ok(url.includes('/transactions/verify_by_reference?tx_ref='));

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Transaction verified',
          data: {
            id: 123456,
            tx_ref: 'INV-001',
            status: 'successful',
            amount: 299.0,
            currency: 'NGN',
            created_at: '2026-05-03T10:00:00Z',
          },
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('INV-001');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.reference, 'INV-001');
  });

  it('should refund by resolving tx_ref to flw_id first when paymentId is non-numeric', async () => {
    const fetchCalls: string[] = [];

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const key = `${options?.method || 'GET'} ${url}`;
      fetchCalls.push(key);

      if (url.includes('/transactions/verify_by_reference')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 789456,
              tx_ref: 'INV-001',
              amount: 299.0,
            },
          }),
        } as any as Response;
      } else if (url.includes('/transactions/789456/refund')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 999,
              status: 'completed',
              amount: 299.0,
              currency: 'NGN',
              created_at: '2026-05-03T11:00:00Z',
            },
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const refund = await provider.refund({
      paymentId: 'INV-001',
    });

    assert.strictEqual(refund.id, '999');
    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].includes('verify_by_reference'));
    assert.ok(fetchCalls[1].includes('/transactions/789456/refund'));
  });

  it('should refund directly when paymentId is numeric', async () => {
    const fetchCalls: string[] = [];

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const key = `${options?.method || 'GET'} ${url}`;
      fetchCalls.push(key);

      if (url.includes('/transactions/123456/refund')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 888,
              status: 'completed',
              amount: 100.0,
              currency: 'USD',
              created_at: '2026-05-03T12:00:00Z',
            },
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const refund = await provider.refund({
      paymentId: '123456',
      amount: 100.0,
    });

    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].includes('/transactions/123456/refund'));
  });

  it('should parse charge.completed with successful status to payment.completed', () => {
    const event = {
      event: 'charge.completed',
      data: {
        id: 123456,
        tx_ref: 'INV-001',
        amount: 299.0,
        currency: 'NGN',
        status: 'successful',
        created_at: '2026-05-03T10:00:00Z',
      },
    };

    const webhookEvent = provider.parseWebhook(event);

    assert.strictEqual(webhookEvent.type, 'payment.completed');
    assert.strictEqual(webhookEvent.payment?.id, '123456');
    assert.strictEqual(webhookEvent.payment?.status, 'completed');
    assert.strictEqual(webhookEvent.payment?.amount, 299.0);
    assert.strictEqual(webhookEvent.payment?.reference, 'INV-001');
  });

  it('should verify valid webhook hash', () => {
    const payload = JSON.stringify({
      event: 'charge.completed',
      data: { id: 123, status: 'successful' },
    });

    const headers = {
      'verif-hash': 'test-webhook-secret-123',
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with missing secret', () => {
    const providerNoSecret = new FlutterwaveProvider({
      apiKey: 'FLWSECK_TEST-abc-X',
      sandbox: true,
    });

    const payload = JSON.stringify({ event: 'charge.completed' });
    const headers = { 'verif-hash': 'some-hash' };

    const isValid = providerNoSecret.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with missing header', () => {
    const payload = JSON.stringify({ event: 'charge.completed' });

    const isValid = provider.verifyWebhook(payload, {});
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with wrong hash', () => {
    const payload = JSON.stringify({ event: 'charge.completed' });

    const headers = {
      'verif-hash': 'wrong-hash-123',
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should throw on unsupported currency', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'XYZ',
          reference: 'TEST-003',
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
      },
      /Currency XYZ not supported/
    );
  });

  it('should return capabilities with correct structure', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 0);
    assert.strictEqual(caps.fees.percent, 1.4);
    assert.strictEqual(caps.fees.currency, 'NGN');
    assert.strictEqual(caps.country, 'NG');
    assert.strictEqual(caps.avgLatencyMs, 700);
    assert.deepStrictEqual(caps.currencies, ['NGN', 'GHS', 'KES', 'UGX', 'ZAR', 'USD', 'EUR', 'GBP']);
  });

  // ==================== Group A: Refund tests ====================

  it('should refund without amount (full refund)', async () => {
    let refundBody: any = null;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('verify_by_reference')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 111222,
              tx_ref: 'TX-FULL',
              amount: 500.0,
            },
          }),
        } as any as Response;
      } else if (url.includes('/refund')) {
        refundBody = options?.body ? JSON.parse(options.body) : null;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 555,
              status: 'completed',
              amount: 500.0,
              currency: 'NGN',
            },
          }),
        } as any as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await provider.refund({
      paymentId: 'TX-FULL',
    });

    assert.ok(refundBody);
    assert.strictEqual(refundBody.amount, undefined); // Full refund
  });

  // Note: Flutterwave refund API does not support reason/comments field

  // ==================== Group B: Error path tests ====================

  it('should throw on 400 response with error message', async () => {
    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          status: 'error',
          message: 'Invalid transaction reference',
        }),
        text: async () => JSON.stringify({
          status: 'error',
          message: 'Invalid transaction reference',
        }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'ERR-400',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /Invalid transaction reference/
    );
  });

  it('should throw on 500 response', async () => {
    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'Server error',
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
      throw new FetchTimeoutError('https://api.flutterwave.com/v3/payments', 30000);
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
        json: async () => ({ status: 'error', message: 'Rate limit exceeded' }),
        text: async () => JSON.stringify({ status: 'error', message: 'Rate limit exceeded' }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'RATE',
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

  it('should accept webhook without timestamp (no replay protection)', () => {
    // Flutterwave uses simple verif-hash header matching, NO timestamp
    const payload = JSON.stringify({ event: 'charge.completed', data: { id: 123 } });

    const headers = {
      'verif-hash': 'test-webhook-secret-123',
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);

    // Note: This provider has NO replay protection
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
