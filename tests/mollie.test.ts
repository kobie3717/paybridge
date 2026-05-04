/**
 * Mollie provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { MollieProvider } from '../src/providers/mollie';

describe('MollieProvider', () => {
  let provider: MollieProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new MollieProvider({
      apiKey: 'test_abcdef123456',
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

  it('should create payment with amount as string with 2 decimals', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'tr_WDqYK6vllg',
          status: 'open',
          _links: {
            checkout: {
              href: 'https://www.mollie.com/checkout/select-method/WDqYK6vllg',
            },
          },
          createdAt: '2026-05-04T10:00:00.000Z',
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'EUR',
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

    assert.strictEqual(payment.id, 'tr_WDqYK6vllg');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.checkoutUrl, 'https://www.mollie.com/checkout/select-method/WDqYK6vllg');

    const parsedBody = JSON.parse(capturedBody);
    assert.strictEqual(parsedBody.amount.value, '299.00');
    assert.strictEqual(parsedBody.amount.currency, 'EUR');
    assert.strictEqual(parsedBody.redirectUrl, 'https://example.com/success');
    assert.strictEqual(parsedBody.cancelUrl, 'https://example.com/cancel');
  });

  it('should throw clean error for subscriptions', async () => {
    await assert.rejects(
      async () => {
        await provider.createSubscription({
          amount: 99.0,
          currency: 'EUR',
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
      /Mollie subscriptions require Customer \+ Mandate setup/
    );
  });

  it('should map paid status to completed', async () => {
    mockResponses.set('GET https://api.mollie.com/v2/payments/tr_paid', {
      data: {
        id: 'tr_paid',
        status: 'paid',
        amount: {
          value: '299.00',
          currency: 'EUR',
        },
        metadata: {
          reference: 'INV-002',
        },
        createdAt: '2026-05-04T10:00:00.000Z',
      },
    });

    const payment = await provider.getPayment('tr_paid');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
  });

  it('should refund without amount for full refund', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 're_4qqhO89gsT',
          status: 'pending',
          amount: {
            value: '299.00',
            currency: 'EUR',
          },
          createdAt: '2026-05-04T10:00:00.000Z',
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'tr_WDqYK6vllg',
    });

    assert.strictEqual(refund.id, 're_4qqhO89gsT');
    assert.strictEqual(refund.status, 'pending');

    const parsedBody = JSON.parse(capturedBody);
    assert.strictEqual(parsedBody.amount, undefined);
  });

  it('should refund with partial amount', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 're_partial',
          status: 'refunded',
          amount: {
            value: '100.00',
            currency: 'EUR',
          },
          createdAt: '2026-05-04T10:00:00.000Z',
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'tr_WDqYK6vllg',
      amount: 100.0,
      reason: 'Customer request',
    });

    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(refund.amount, 100.0);

    const parsedBody = JSON.parse(capturedBody);
    assert.strictEqual(parsedBody.amount.value, '100.00');
  });

  it('should parse form-encoded webhook (id=tr_xxx)', () => {
    const body = 'id=tr_abc123';

    const event = provider.parseWebhook(body);

    assert.strictEqual(event.type, 'payment.pending');
    assert.strictEqual(event.payment?.id, 'tr_abc123');
  });

  it('should parse JSON webhook', () => {
    const body = { id: 'tr_xyz789' };

    const event = provider.parseWebhook(body);

    assert.strictEqual(event.type, 'payment.pending');
    assert.strictEqual(event.payment?.id, 'tr_xyz789');
  });

  it('should always return true for verifyWebhook (documented limitation)', () => {
    const body = JSON.stringify({ id: 'tr_test' });

    const isValid = provider.verifyWebhook(body, {});

    assert.strictEqual(isValid, true);
  });

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

  it('should return capabilities with EUR fees', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 0.25);
    assert.strictEqual(caps.fees.percent, 1.8);
    assert.strictEqual(caps.fees.currency, 'EUR');
    assert.strictEqual(caps.country, 'EU');
    assert.strictEqual(caps.avgLatencyMs, 350);
  });
});
