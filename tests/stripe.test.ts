/**
 * Stripe provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { StripeProvider } from '../src/providers/stripe';
import { toMinorUnit } from '../src/utils/currency';

describe('StripeProvider', () => {
  let provider: StripeProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new StripeProvider({
      apiKey: 'sk_test_123456789',
      webhookSecret: 'whsec_test123',
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

  it('should create payment with correct URL-encoded body', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/pay/cs_test_123',
          amount_total: 29900,
          currency: 'zar',
          client_reference_id: 'INV-001',
          created: Math.floor(Date.now() / 1000),
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'ZAR',
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

    assert.strictEqual(payment.id, 'cs_test_123');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'ZAR');

    assert.ok(capturedBody.includes('mode=payment'));
    assert.ok(capturedBody.includes('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=29900'));
    assert.ok(capturedBody.includes('line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=zar'));
    assert.ok(capturedBody.includes('success_url=https%3A%2F%2Fexample.com%2Fsuccess'));
  });

  it('should create subscription with recurring interval', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'cs_test_sub_123',
          url: 'https://checkout.stripe.com/pay/cs_test_sub_123',
          amount_total: 29900,
          currency: 'usd',
          client_reference_id: 'SUB-001',
          created: Math.floor(Date.now() / 1000),
        }),
      } as any as Response;
    };

    const subscription = await provider.createSubscription({
      amount: 299.0,
      currency: 'USD',
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

    assert.strictEqual(subscription.id, 'cs_test_sub_123');
    assert.strictEqual(subscription.status, 'pending');
    assert.strictEqual(subscription.interval, 'monthly');

    assert.ok(capturedBody.includes('mode=subscription'));
    assert.ok(
      capturedBody.includes(
        'line_items%5B0%5D%5Bprice_data%5D%5Brecurring%5D%5Binterval%5D=month'
      )
    );
  });

  it('should map payment_status=paid to completed', async () => {
    mockResponses.set('GET https://api.stripe.com/v1/checkout/sessions/cs_test_paid', {
      data: {
        id: 'cs_test_paid',
        payment_status: 'paid',
        status: 'complete',
        url: 'https://checkout.stripe.com/pay/cs_test_paid',
        amount_total: 29900,
        currency: 'usd',
        client_reference_id: 'INV-002',
        created: Math.floor(Date.now() / 1000),
      },
    });

    const payment = await provider.getPayment('cs_test_paid');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
  });

  it('should refund by fetching session first to get payment_intent', async () => {
    const fetchCalls: string[] = [];

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const key = `${options?.method || 'GET'} ${url}`;
      fetchCalls.push(key);

      if (url.includes('/checkout/sessions/cs_test_123')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'cs_test_123',
            payment_intent: 'pi_test_456',
            amount_total: 29900,
            currency: 'usd',
          }),
        } as any as Response;
      } else if (url.includes('/refunds')) {
        const body = options?.body || '';
        assert.ok(body.includes('payment_intent=pi_test_456'));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ref_test_789',
            status: 'succeeded',
            amount: 29900,
            currency: 'usd',
            created: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const refund = await provider.refund({
      paymentId: 'cs_test_123',
    });

    assert.strictEqual(refund.id, 'ref_test_789');
    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].includes('/checkout/sessions/cs_test_123'));
    assert.ok(fetchCalls[1].includes('/refunds'));
  });

  it('should verify valid webhook signature', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: {} });

    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(signedPayload)
      .digest('hex');

    const headers = {
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with missing secret', () => {
    const providerNoSecret = new StripeProvider({
      apiKey: 'sk_test_123',
      sandbox: true,
    });

    const payload = JSON.stringify({ type: 'payment.succeeded' });
    const headers = { 'stripe-signature': 't=123,v1=abc' };

    const isValid = providerNoSecret.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with missing header', () => {
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const isValid = provider.verifyWebhook(payload, {});
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with expired timestamp', () => {
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(signedPayload)
      .digest('hex');

    const headers = {
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with tampered body', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const originalPayload = JSON.stringify({ type: 'payment.succeeded', amount: 100 });
    const tamperedPayload = JSON.stringify({ type: 'payment.succeeded', amount: 999 });

    const signedPayload = `${timestamp}.${originalPayload}`;
    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(signedPayload)
      .digest('hex');

    const headers = {
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    };

    const isValid = provider.verifyWebhook(tamperedPayload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with wrong signature', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const headers = {
      'stripe-signature': `t=${timestamp},v1=wrong_signature_123`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should parse checkout.session.completed webhook', () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          client_reference_id: 'INV-001',
          created: Math.floor(Date.now() / 1000),
        },
      },
    };

    const webhookEvent = provider.parseWebhook(event);

    assert.strictEqual(webhookEvent.type, 'payment.completed');
    assert.strictEqual(webhookEvent.payment?.id, 'cs_test_123');
    assert.strictEqual(webhookEvent.payment?.status, 'completed');
    assert.strictEqual(webhookEvent.payment?.amount, 299.0);
  });

  it('should return capabilities with correct fee structure', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 0.30);
    assert.strictEqual(caps.fees.percent, 2.9);
    assert.strictEqual(caps.fees.currency, 'USD');
    assert.strictEqual(caps.country, 'GLOBAL');
    assert.strictEqual(caps.avgLatencyMs, 400);
    assert.deepStrictEqual(caps.currencies, ['USD', 'EUR', 'GBP', 'ZAR', 'NGN']);
  });

  // ==================== Group A: Refund tests ====================

  it('should refund with partial amount', async () => {
    let refundBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/checkout/sessions/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'cs_test_partial',
            payment_intent: 'pi_partial_123',
            amount_total: 50000,
            currency: 'usd',
          }),
        } as any as Response;
      } else if (url.includes('/refunds')) {
        refundBody = options?.body || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ref_partial_456',
            status: 'succeeded',
            amount: 10000,
            currency: 'usd',
            created: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const refund = await provider.refund({
      paymentId: 'cs_test_partial',
      amount: 100.0,
    });

    assert.strictEqual(refund.amount, 100.0);
    assert.ok(refundBody.includes('amount=10000')); // cents
  });

  it('should refund with reason mapping to metadata', async () => {
    let refundBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/checkout/sessions/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'cs_test_reason',
            payment_intent: 'pi_reason_123',
            amount_total: 10000,
            currency: 'usd',
          }),
        } as any as Response;
      } else if (url.includes('/refunds')) {
        refundBody = options?.body || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ref_reason_789',
            status: 'succeeded',
            amount: 10000,
            currency: 'usd',
            created: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await provider.refund({
      paymentId: 'cs_test_reason',
      reason: 'Customer request',
    });

    // Stripe maps reason to requested_by_customer for official field + metadata[reason]
    assert.ok(refundBody.includes('reason=requested_by_customer'), `Expected reason=requested_by_customer in: ${refundBody}`);
    // The metadata field is nested, so it becomes metadata%5Breason%5D (URL-encoded [reason])
    assert.ok(refundBody.includes('metadata%5Breason%5D=Customer'), `Expected metadata[reason] in: ${refundBody}`);
  });

  // ==================== Group B: Error path tests ====================

  it('should throw HttpError on 400 response', async () => {
    const { HttpError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]) as any,
        text: async () => JSON.stringify({ error: { message: 'Invalid amount' } }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'USD',
          reference: 'ERR-400',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.strictEqual(err.status, 400);
        assert.ok(err.message.includes('Invalid amount'));
        return true;
      }
    );
  });

  it('should throw HttpError on 500 response', async () => {
    const { HttpError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'text/plain']]) as any,
        text: async () => 'Server error occurred',
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'USD',
          reference: 'ERR-500',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.strictEqual(err.status, 500);
        return true;
      }
    );
  });

  it('should propagate FetchTimeoutError', async () => {
    const { FetchTimeoutError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async () => {
      throw new FetchTimeoutError('https://api.stripe.com/v1/checkout/sessions', 30000);
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'USD',
          reference: 'ERR-TIMEOUT',
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

  it('should throw HttpError on 429 rate limit', async () => {
    const { HttpError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([
          ['content-type', 'application/json'],
          ['retry-after', '60'],
        ]) as any,
        text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'USD',
          reference: 'ERR-429',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.strictEqual(err.status, 429);
        return true;
      }
    );
  });

  // ==================== Group D: Webhook timestamp boundary tests ====================

  it('should accept webhook at exactly 5min boundary (299 seconds old)', () => {
    const timestamp = Math.floor(Date.now() / 1000) - 299;
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(signedPayload)
      .digest('hex');

    const headers = {
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook at exactly 5min boundary (301 seconds old)', () => {
    const timestamp = Math.floor(Date.now() / 1000) - 301;
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(signedPayload)
      .digest('hex');

    const headers = {
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  // ==================== Group E: Currency edge cases ====================
  // Note: Amount validation (0, negative, NaN, Infinity) is done by the Router, not providers.
  // Provider unit tests focus on provider-specific logic.

  it('should throw on unsupported currency XYZ', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'XYZ',
          reference: 'UNSUP-CUR',
          customer: { name: 'Test', email: 'test@example.com' },
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

  it('should throw on lowercase currency (case-sensitive validation)', async () => {
    // Stripe validation is case-sensitive - lowercase 'zar' is rejected
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'zar',
          reference: 'LOWER-CASE',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /Currency zar not supported/
    );
  });
});
