/**
 * Yoco provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { YocoProvider } from '../src/providers/yoco';

describe('YocoProvider', () => {
  let provider: YocoProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new YocoProvider({
      apiKey: 'sk_test_123456789',
      sandbox: true,
      webhookSecret: 'whsec_test123base64encoded',
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

  it('should create payment with correct JSON body and Idempotency-Key header', async () => {
    let capturedBody = '';
    let capturedHeaders: Record<string, string> = {};

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';
      capturedHeaders = options?.headers || {};

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'ch_abc123',
          redirectUrl: 'https://pay.yoco.com/i/abc123',
          amount: 29900,
          currency: 'ZAR',
          status: 'created',
          metadata: {
            reference: 'INV-001',
          },
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

    assert.strictEqual(payment.id, 'ch_abc123');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'ZAR');

    const body = JSON.parse(capturedBody);
    assert.strictEqual(body.amount, 29900);
    assert.strictEqual(body.currency, 'ZAR');
    assert.strictEqual(body.metadata.reference, 'INV-001');

    assert.ok(capturedHeaders['Idempotency-Key']);
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer sk_test_123456789');
  });

  it('should map redirectUrl to checkoutUrl in response', async () => {
    mockResponses.set('POST https://payments.yoco.com/api/v1/checkouts', {
      data: {
        id: 'ch_xyz',
        redirectUrl: 'https://pay.yoco.com/i/xyz',
        amount: 50000,
        currency: 'ZAR',
        status: 'created',
        metadata: { reference: 'INV-002' },
      },
    });

    const payment = await provider.createPayment({
      amount: 500.0,
      currency: 'ZAR',
      reference: 'INV-002',
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

    assert.strictEqual(payment.checkoutUrl, 'https://pay.yoco.com/i/xyz');
  });

  it('should throw error for unsupported subscription', async () => {
    await assert.rejects(
      async () => {
        await provider.createSubscription({
          amount: 99.0,
          currency: 'ZAR',
          interval: 'monthly',
          reference: 'SUB-001',
          customer: {
            name: 'Bob Smith',
            email: 'bob@example.com',
          },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      {
        message: /Yoco does not support subscriptions/,
      }
    );
  });

  it('should map succeeded status to completed in getPayment', async () => {
    mockResponses.set('GET https://payments.yoco.com/api/v1/checkouts/ch_paid', {
      data: {
        id: 'ch_paid',
        redirectUrl: 'https://pay.yoco.com/i/paid',
        amount: 29900,
        currency: 'ZAR',
        status: 'succeeded',
        metadata: { reference: 'INV-003' },
      },
    });

    const payment = await provider.getPayment('ch_paid');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.id, 'ch_paid');
  });

  it('should POST refund with checkoutId and amount', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rf_xyz',
          status: 'completed',
          amount: 15000,
          currency: 'ZAR',
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'ch_abc',
      amount: 150.0,
      reason: 'Customer request',
    });

    const body = JSON.parse(capturedBody);
    assert.strictEqual(body.checkoutId, 'ch_abc');
    assert.strictEqual(body.amount, 15000);
    assert.strictEqual(body.metadata.reason, 'Customer request');

    assert.strictEqual(refund.id, 'rf_xyz');
    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(refund.amount, 150.0);
  });

  it('should POST refund without amount for full refund', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rf_full',
          status: 'pending',
          amount: 29900,
          currency: 'ZAR',
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'ch_abc',
    });

    const body = JSON.parse(capturedBody);
    assert.strictEqual(body.checkoutId, 'ch_abc');
    assert.strictEqual(body.amount, undefined);
  });

  it('should parse payment.succeeded webhook event', () => {
    const webhookBody = {
      type: 'payment.succeeded',
      id: 'evt_123',
      createdDate: '2026-05-03T12:00:00Z',
      payload: {
        id: 'ch_webhook',
        type: 'checkout',
        status: 'succeeded',
        amount: 29900,
        currency: 'ZAR',
        metadata: { reference: 'INV-004' },
      },
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.completed');
    assert.strictEqual(event.payment?.id, 'ch_webhook');
    assert.strictEqual(event.payment?.status, 'completed');
    assert.strictEqual(event.payment?.amount, 299.0);
    assert.strictEqual(event.payment?.reference, 'INV-004');
  });

  it('should parse payment.failed webhook event', () => {
    const webhookBody = {
      type: 'payment.failed',
      payload: {
        id: 'ch_failed',
        status: 'failed',
        amount: 10000,
        currency: 'ZAR',
      },
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.failed');
    assert.strictEqual(event.payment?.status, 'failed');
  });

  it('should parse refund.succeeded webhook event', () => {
    const webhookBody = {
      type: 'refund.succeeded',
      payload: {
        id: 'rf_webhook',
        status: 'succeeded',
        amount: 5000,
        currency: 'ZAR',
      },
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'refund.completed');
    assert.strictEqual(event.payment?.status, 'completed');
  });

  it('should verify valid Svix-signed webhook', () => {
    const webhookId = 'msg_abc123';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ type: 'payment.succeeded', payload: {} });

    const signedPayload = `${webhookId}.${timestamp}.${payload}`;
    const secret = Buffer.from('test123base64encoded', 'base64');
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');

    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };

    const providerWithSecret = new YocoProvider({
      apiKey: 'sk_test_123',
      sandbox: true,
      webhookSecret: 'whsec_test123base64encoded',
    });

    const isValid = providerWithSecret.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should return false when webhook secret is missing', () => {
    const providerNoSecret = new YocoProvider({
      apiKey: 'sk_test_123',
      sandbox: true,
    });

    const payload = JSON.stringify({ type: 'payment.succeeded' });
    const headers = {
      'webhook-id': 'msg_123',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,abc',
    };

    const isValid = providerNoSecret.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhook-timestamp header is missing', () => {
    const payload = JSON.stringify({ type: 'payment.succeeded' });
    const headers = {
      'webhook-id': 'msg_123',
      'webhook-signature': 'v1,abc',
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when timestamp is expired (>5 minutes old)', () => {
    const webhookId = 'msg_old';
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const signedPayload = `${webhookId}.${timestamp}.${payload}`;
    const secret = Buffer.from('test123base64encoded', 'base64');
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');

    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhook body is tampered', () => {
    const webhookId = 'msg_tamper';
    const timestamp = Math.floor(Date.now() / 1000);
    const originalPayload = JSON.stringify({ type: 'payment.succeeded', amount: 100 });
    const tamperedPayload = JSON.stringify({ type: 'payment.succeeded', amount: 999 });

    const signedPayload = `${webhookId}.${timestamp}.${originalPayload}`;
    const secret = Buffer.from('test123base64encoded', 'base64');
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');

    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };

    const isValid = provider.verifyWebhook(tamperedPayload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when signature is wrong', () => {
    const webhookId = 'msg_wrong';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': 'v1,wrong_signature_base64==',
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  it('should throw error for unsupported currency', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'USD',
          reference: 'INV-USD',
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
      {
        message: /Currency USD not supported by yoco/,
      }
    );
  });

  it('should return capabilities with correct fee structure', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 0);
    assert.strictEqual(caps.fees.percent, 2.95);
    assert.strictEqual(caps.fees.currency, 'ZAR');
    assert.strictEqual(caps.country, 'ZA');
    assert.strictEqual(caps.avgLatencyMs, 500);
    assert.deepStrictEqual(caps.currencies, ['ZAR']);
  });

  // ==================== Group A: Refund tests ====================

  it('should refund with reason in metadata', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rf_reason',
          status: 'completed',
          amount: 10000,
          currency: 'ZAR',
        }),
      } as any as Response;
    };

    await provider.refund({
      paymentId: 'ch_test',
      amount: 100.0,
      reason: 'Duplicate charge',
    });

    const body = JSON.parse(capturedBody);
    assert.strictEqual(body.metadata.reason, 'Duplicate charge');
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
        text: async () => JSON.stringify({ message: 'Invalid checkout amount' }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'ZAR',
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
        return true;
      }
    );
  });

  it('should throw HttpError on 500 response', async () => {
    const { HttpError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map() as any,
        text: async () => 'Internal error',
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.refund({ paymentId: 'ch_error' });
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
      throw new FetchTimeoutError('https://payments.yoco.com/api/v1/checkouts', 30000);
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'ZAR',
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

  it('should throw HttpError on 429 rate limit', async () => {
    const { HttpError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['retry-after', '30']]) as any,
        text: async () => 'Rate limit exceeded',
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'ZAR',
          reference: 'RATE-LIMIT',
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

  // ==================== Group C: Idempotency tests ====================

  it('should generate different Idempotency-Keys for separate calls', async () => {
    const capturedKeys: string[] = [];

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const headers = options?.headers || {};
      capturedKeys.push(headers['Idempotency-Key']);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: `ch_${Date.now()}`,
          redirectUrl: 'https://pay.yoco.com/i/test',
          amount: 10000,
          currency: 'ZAR',
          status: 'created',
        }),
      } as any as Response;
    };

    await provider.createPayment({
      amount: 100.0,
      currency: 'ZAR',
      reference: 'IDEMPOTENT-1',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    await provider.createPayment({
      amount: 100.0,
      currency: 'ZAR',
      reference: 'IDEMPOTENT-2',
      customer: { name: 'Test', email: 'test@example.com' },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(capturedKeys.length, 2);
    assert.notStrictEqual(capturedKeys[0], capturedKeys[1]);
    assert.ok(capturedKeys[0].length > 0);
    assert.ok(capturedKeys[1].length > 0);
  });

  // ==================== Group D: Webhook timestamp boundary tests ====================

  it('should accept webhook at exactly 5min boundary (299 seconds old)', () => {
    const webhookId = 'msg_boundary_ok';
    const timestamp = Math.floor(Date.now() / 1000) - 299;
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const signedPayload = `${webhookId}.${timestamp}.${payload}`;
    const secret = Buffer.from('test123base64encoded', 'base64');
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');

    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook at exactly 5min boundary (301 seconds old)', () => {
    const webhookId = 'msg_boundary_fail';
    const timestamp = Math.floor(Date.now() / 1000) - 301;
    const payload = JSON.stringify({ type: 'payment.succeeded' });

    const signedPayload = `${webhookId}.${timestamp}.${payload}`;
    const secret = Buffer.from('test123base64encoded', 'base64');
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');

    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };

    const isValid = provider.verifyWebhook(payload, headers);
    assert.strictEqual(isValid, false);
  });

  // ==================== Group E: Currency edge cases ====================
  // Note: Amount validation (0, negative, NaN, Infinity) is done by the Router, not providers.

  it('should throw on lowercase currency (case-sensitive validation)', async () => {
    // Yoco validation is case-sensitive - lowercase 'zar' is rejected
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'zar',
          reference: 'LOWER',
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
