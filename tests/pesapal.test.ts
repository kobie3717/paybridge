/**
 * Pesapal provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { PesapalProvider } from '../src/providers/pesapal';

describe('PesapalProvider', () => {
  let provider: PesapalProvider;
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: string[];

  beforeEach(() => {
    provider = new PesapalProvider({
      consumerKey: 'qkio1BGGYAXTu2JOfm7XSXNjdG5oclmBB',
      consumerSecret: 'osGQ364R49cXKeOYSpaOnT++rHs=',
      notificationId: 'IPN123',
      username: 'merchant@example.com',
      webhookSecret: 'whsec_test123',
      sandbox: true,
    });

    fetchCalls = [];
    originalFetch = globalThis.fetch;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      const key = `${options?.method || 'GET'} ${url}`;
      fetchCalls.push(key);

      if (url.includes('/Auth/RequestToken')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            token: 'fake_token_12345',
            expiryDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          }),
        } as any as Response;
      }

      if (url.includes('/SubmitOrderRequest')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            order_tracking_id: 'ORDER123',
            merchant_reference: 'INV-001',
            redirect_url: 'https://pay.pesapal.com/iframe/ORDER123',
            status: '200',
          }),
        } as any as Response;
      }

      if (url.includes('/GetTransactionStatus')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            payment_status_description: 'Completed',
            amount: 299.0,
            currency: 'KES',
            merchant_reference: 'INV-002',
            created_date: '2026-05-04T10:00:00.000Z',
          }),
        } as any as Response;
      }

      if (url.includes('/RefundRequest')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            refund_id: 'REFUND123',
            status: 'Success',
            amount: 100.0,
            currency: 'KES',
            created_date: '2026-05-04T10:00:00.000Z',
          }),
        } as any as Response;
      }

      throw new Error(`No mock response for: ${key}`);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should cache token (two calls to authenticated endpoint = one RequestToken call)', async () => {
    fetchCalls = [];

    await provider.createPayment({
      amount: 299.0,
      currency: 'KES',
      reference: 'INV-001',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+254712345678',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    await provider.getPayment('ORDER123');

    const tokenCalls = fetchCalls.filter((c) => c.includes('/Auth/RequestToken'));
    assert.strictEqual(tokenCalls.length, 1);
  });

  it('should create payment with major-unit amount', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/Auth/RequestToken')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'fake_token_12345' }),
        } as any as Response;
      }

      if (url.includes('/SubmitOrderRequest')) {
        capturedBody = options?.body || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            order_tracking_id: 'ORDER123',
            redirect_url: 'https://pay.pesapal.com/iframe/ORDER123',
          }),
        } as any as Response;
      }

      throw new Error('Unexpected URL');
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'KES',
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

    assert.strictEqual(payment.id, 'ORDER123');
    assert.strictEqual(payment.status, 'pending');

    const parsedBody = JSON.parse(capturedBody);
    assert.strictEqual(parsedBody.amount, 299.0);
    assert.strictEqual(parsedBody.currency, 'KES');
    assert.strictEqual(parsedBody.notification_id, 'IPN123');
  });

  it('should throw clean error for subscriptions', async () => {
    await assert.rejects(
      async () => {
        await provider.createSubscription({
          amount: 99.0,
          currency: 'KES',
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
      /Pesapal subscriptions not yet supported/
    );
  });

  it('should map Completed status to completed', async () => {
    const payment = await provider.getPayment('ORDER123');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
  });

  it('should throw for refund without username config', async () => {
    const providerNoUsername = new PesapalProvider({
      consumerKey: 'qkio1BGGYAXTu2JOfm7XSXNjdG5oclmBB',
      consumerSecret: 'osGQ364R49cXKeOYSpaOnT++rHs=',
      sandbox: true,
    });

    await assert.rejects(
      async () => {
        await providerNoUsername.refund({
          paymentId: 'ORDER123',
        });
      },
      /Pesapal refunds require username config/
    );
  });

  it('should refund with username', async () => {
    const refund = await provider.refund({
      paymentId: 'ORDER123',
      amount: 100.0,
      reason: 'Customer request',
    });

    assert.strictEqual(refund.id, 'REFUND123');
    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(refund.amount, 100.0);
  });

  it('should parse form-encoded IPN webhook', () => {
    const body = 'OrderTrackingId=ORDER123&OrderMerchantReference=INV-001';

    const event = provider.parseWebhook(body);

    assert.strictEqual(event.type, 'payment.pending');
    assert.strictEqual(event.payment?.id, 'ORDER123');
    assert.strictEqual(event.payment?.reference, 'INV-001');
  });

  it('should parse JSON IPN webhook', () => {
    const body = { OrderTrackingId: 'ORDER456', OrderMerchantReference: 'INV-002' };

    const event = provider.parseWebhook(body);

    assert.strictEqual(event.type, 'payment.pending');
    assert.strictEqual(event.payment?.id, 'ORDER456');
    assert.strictEqual(event.payment?.reference, 'INV-002');
  });

  it('should always return true for verifyWebhook (documented limitation)', () => {
    const body = JSON.stringify({ OrderTrackingId: 'ORDER123' });

    const isValid = provider.verifyWebhook(body, {});

    assert.strictEqual(isValid, true);
  });

  it('should throw on unsupported currency EUR', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'EUR',
          reference: 'UNSUP-CUR',
          customer: { name: 'Test', email: 'test@example.com' },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      /Currency EUR not supported/
    );
  });

  it('should return capabilities with KES fees', () => {
    const caps = provider.getCapabilities();

    assert.strictEqual(caps.fees.fixed, 0);
    assert.strictEqual(caps.fees.percent, 3.5);
    assert.strictEqual(caps.fees.currency, 'KES');
    assert.strictEqual(caps.country, 'KE');
    assert.strictEqual(caps.avgLatencyMs, 900);
  });
});
