/**
 * Square provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { SquareProvider } from '../src/providers/square';

describe('SquareProvider', () => {
  let provider: SquareProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new SquareProvider({
      accessToken: 'EAAAEOuLQhWnLvejLHLHP5aMj_test',
      locationId: 'LOCATION123',
      notificationUrl: 'https://example.com/webhook',
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

  it('should create payment with idempotency key and location_id', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          payment_link: {
            id: 'LINK123',
            version: 1,
            order_id: 'ORDER123',
            url: 'https://square.link/u/LINK123',
            created_at: '2026-05-04T10:00:00.000Z',
          },
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'USD',
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

    assert.strictEqual(payment.id, 'LINK123');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.checkoutUrl, 'https://square.link/u/LINK123');

    const parsedBody = JSON.parse(capturedBody);
    assert.ok(parsedBody.idempotency_key);
    assert.strictEqual(parsedBody.quick_pay.location_id, 'LOCATION123');
    assert.strictEqual(parsedBody.quick_pay.price_money.amount, 29900);
  });

  it('should use sandbox URL when sandbox=true', async () => {
    let capturedUrl = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedUrl = url;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          payment_link: {
            id: 'LINK123',
            version: 1,
            order_id: 'ORDER123',
            url: 'https://square.link/u/LINK123',
            created_at: '2026-05-04T10:00:00.000Z',
          },
        }),
      } as any as Response;
    };

    await provider.createPayment({
      amount: 299.0,
      currency: 'USD',
      reference: 'INV-001',
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

    assert.ok(capturedUrl.includes('squareupsandbox'));
  });

  it('should throw clean error for subscriptions', async () => {
    await assert.rejects(
      async () => {
        await provider.createSubscription({
          amount: 99.0,
          currency: 'USD',
          interval: 'monthly',
          reference: 'SUB-001',
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
      },
      /Square subscriptions require multi-step Catalog/
    );
  });

  it('should get payment with 2-step lookup (link then order)', async () => {
    const fetchCalls: string[] = [];

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const key = `${options?.method || 'GET'} ${url}`;
      fetchCalls.push(key);

      if (url.includes('/online-checkout/payment-links/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            payment_link: {
              id: 'LINK123',
              order_id: 'ORDER123',
              url: 'https://square.link/u/LINK123',
              created_at: '2026-05-04T10:00:00.000Z',
            },
          }),
        } as any as Response;
      } else if (url.includes('/orders/ORDER123')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            order: {
              id: 'ORDER123',
              state: 'COMPLETED',
              total_money: {
                amount: 29900,
                currency: 'USD',
              },
            },
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const payment = await provider.getPayment('LINK123');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].includes('/payment-links/'));
    assert.ok(fetchCalls[1].includes('/orders/'));
  });

  it('should refund with idempotency key', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          refund: {
            id: 'REFUND123',
            status: 'COMPLETED',
            amount_money: {
              amount: 29900,
              currency: 'USD',
            },
            created_at: '2026-05-04T10:00:00.000Z',
          },
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'PAYMENT123',
      amount: 299.0,
      reason: 'Customer request',
    });

    assert.strictEqual(refund.id, 'REFUND123');
    assert.strictEqual(refund.status, 'completed');

    const parsedBody = JSON.parse(capturedBody);
    assert.ok(parsedBody.idempotency_key);
    assert.strictEqual(parsedBody.payment_id, 'PAYMENT123');
  });

  it('should verify valid HMAC-SHA256 webhook signature', () => {
    const notificationUrl = 'https://example.com/webhook';
    const payload = JSON.stringify({ type: 'payment.created', data: {} });

    const signedString = `${notificationUrl}${payload}`;
    const signature = crypto
      .createHmac('sha256', 'whsec_test123')
      .update(signedString)
      .digest('base64');

    const headers = {
      'x-square-hmacsha256-signature': signature,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should return false when notificationUrl missing', () => {
    const providerNoUrl = new SquareProvider({
      accessToken: 'EAAAEOuLQhWnLvejLHLHP5aMj_test',
      locationId: 'LOCATION123',
      webhookSecret: 'whsec_test123',
      sandbox: true,
    });

    const payload = JSON.stringify({ type: 'payment.created' });
    const headers = { 'x-square-hmacsha256-signature': 'abc123' };

    const isValid = providerNoUrl.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhookSecret missing', () => {
    const providerNoSecret = new SquareProvider({
      accessToken: 'EAAAEOuLQhWnLvejLHLHP5aMj_test',
      locationId: 'LOCATION123',
      notificationUrl: 'https://example.com/webhook',
      sandbox: true,
    });

    const payload = JSON.stringify({ type: 'payment.created' });
    const headers = { 'x-square-hmacsha256-signature': 'abc123' };

    const isValid = providerNoSecret.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should throw on unsupported currency ZAR', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'ZAR',
          reference: 'UNSUP-CUR',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /Currency ZAR not supported/
    );
  });

  it('should return capabilities with USD fees', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 0.10);
    assert.strictEqual(caps.fees.percent, 2.6);
    assert.strictEqual(caps.fees.currency, 'USD');
    assert.strictEqual(caps.country, 'US');
    assert.strictEqual(caps.avgLatencyMs, 400);
  });
});
