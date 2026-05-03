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
});
