/**
 * Mercado Pago provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { MercadoPagoProvider } from '../src/providers/mercadopago';

describe('MercadoPagoProvider', () => {
  let provider: MercadoPagoProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new MercadoPagoProvider({
      accessToken: 'TEST-123456789',
      webhookSecret: 'test_webhook_secret',
      sandbox: true,
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create payment with major-unit amount', async () => {
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'pref-123',
          init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-123',
          sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-123',
          external_reference: 'INV-001',
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'BRL',
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

    assert.strictEqual(payment.id, 'pref-123');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'BRL');

    assert.strictEqual(capturedBody.items[0].unit_price, 299.0);
    assert.strictEqual(capturedBody.items[0].currency_id, 'BRL');
    assert.strictEqual(capturedBody.external_reference, 'INV-001');
    assert.strictEqual(capturedBody.payer.email, 'john@example.com');
    assert.strictEqual(capturedBody.payer.name, 'John');
    assert.strictEqual(capturedBody.payer.surname, 'Doe');
    assert.strictEqual(capturedBody.notification_url, 'https://example.com/webhook');
  });

  it('should return sandbox_init_point in sandbox mode', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'pref-456',
          init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-456',
          sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-456',
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'BRL',
      reference: 'INV-002',
      customer: {
        name: 'Jane Smith',
        email: 'jane@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(payment.checkoutUrl, 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-456');
  });

  it('should return init_point in live mode', async () => {
    const liveProvider = new MercadoPagoProvider({
      accessToken: 'APP_USR-123456789',
      sandbox: false,
    });

    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'pref-789',
          init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-789',
          sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-789',
        }),
      } as any as Response;
    };

    const payment = await liveProvider.createPayment({
      amount: 299.0,
      currency: 'BRL',
      reference: 'INV-003',
      customer: {
        name: 'Bob Lee',
        email: 'bob@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(payment.checkoutUrl, 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-789');
  });

  it('should create weekly subscription with 7 days frequency', async () => {
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'sub-123',
          init_point: 'https://www.mercadopago.com/subscriptions/checkout?preapproval_id=sub-123',
        }),
      } as any as Response;
    };

    const subscription = await provider.createSubscription({
      amount: 299.0,
      currency: 'BRL',
      interval: 'weekly',
      reference: 'SUB-001',
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

    assert.strictEqual(subscription.id, 'sub-123');
    assert.strictEqual(subscription.interval, 'weekly');
    assert.strictEqual(capturedBody.auto_recurring.frequency, 7);
    assert.strictEqual(capturedBody.auto_recurring.frequency_type, 'days');
  });

  it('should create monthly subscription with 1 month frequency', async () => {
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'sub-456',
          init_point: 'https://www.mercadopago.com/subscriptions/checkout?preapproval_id=sub-456',
        }),
      } as any as Response;
    };

    await provider.createSubscription({
      amount: 299.0,
      currency: 'BRL',
      interval: 'monthly',
      reference: 'SUB-002',
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

    assert.strictEqual(capturedBody.auto_recurring.frequency, 1);
    assert.strictEqual(capturedBody.auto_recurring.frequency_type, 'months');
  });

  it('should create yearly subscription with 12 months frequency', async () => {
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'sub-789',
          init_point: 'https://www.mercadopago.com/subscriptions/checkout?preapproval_id=sub-789',
        }),
      } as any as Response;
    };

    await provider.createSubscription({
      amount: 299.0,
      currency: 'BRL',
      interval: 'yearly',
      reference: 'SUB-003',
      customer: {
        name: 'Bob Doe',
        email: 'bob@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(capturedBody.auto_recurring.frequency, 12);
    assert.strictEqual(capturedBody.auto_recurring.frequency_type, 'months');
  });

  it('should map approved status to completed', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 12345,
              status: 'approved',
              transaction_amount: 299.0,
              currency_id: 'BRL',
              external_reference: 'INV-001',
              date_created: '2026-05-04T10:00:00.000Z',
            },
          ],
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('INV-001');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'BRL');
  });

  it('should map rejected status to failed', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 12346,
              status: 'rejected',
              transaction_amount: 299.0,
              currency_id: 'BRL',
              external_reference: 'INV-002',
              date_created: '2026-05-04T10:00:00.000Z',
            },
          ],
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('INV-002');
    assert.strictEqual(payment.status, 'failed');
  });

  it('should return pending when no payment found', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [],
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('INV-999');
    assert.strictEqual(payment.status, 'pending');
  });

  it('should POST refund to correct endpoint', async () => {
    let capturedUrl = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedUrl = url;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 98765,
          status: 'approved',
          amount: 299.0,
          payment: {
            currency_id: 'BRL',
          },
          date_created: '2026-05-04T10:00:00.000Z',
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: '12345',
      amount: 299.0,
    });

    assert.ok(capturedUrl.includes('/v1/payments/12345/refunds'));
    assert.strictEqual(refund.id, '98765');
    assert.strictEqual(refund.status, 'completed');
  });

  it('should verify webhook with valid signature and timestamp', () => {
    const webhookBody = {
      type: 'payment',
      data: { id: '12345' },
      action: 'payment.created',
    };

    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-123';
    const template = `id:12345;request-id:${requestId};ts:${ts};`;
    const validSig = crypto.createHmac('sha256', 'test_webhook_secret').update(template, 'utf8').digest('hex');

    const headers = {
      'x-signature': `ts=${ts},v1=${validSig}`,
      'x-request-id': requestId,
    };

    const isValid = provider.verifyWebhook(JSON.stringify(webhookBody), headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with expired timestamp', () => {
    const webhookBody = {
      type: 'payment',
      data: { id: '12345' },
      action: 'payment.created',
    };

    const ts = Math.floor(Date.now() / 1000) - 400;
    const requestId = 'req-123';
    const template = `id:12345;request-id:${requestId};ts:${ts};`;
    const validSig = crypto.createHmac('sha256', 'test_webhook_secret').update(template, 'utf8').digest('hex');

    const headers = {
      'x-signature': `ts=${ts},v1=${validSig}`,
      'x-request-id': requestId,
    };

    const isValid = provider.verifyWebhook(JSON.stringify(webhookBody), headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject webhook with wrong signature', () => {
    const webhookBody = {
      type: 'payment',
      data: { id: '12345' },
      action: 'payment.created',
    };

    const ts = Math.floor(Date.now() / 1000);
    const headers = {
      'x-signature': `ts=${ts},v1=wrongsignature`,
      'x-request-id': 'req-123',
    };

    const isValid = provider.verifyWebhook(JSON.stringify(webhookBody), headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhookSecret missing', () => {
    const providerNoSecret = new MercadoPagoProvider({
      accessToken: 'TEST-123456789',
      sandbox: true,
    });

    const webhookBody = {
      type: 'payment',
      data: { id: '12345' },
    };

    const headers = {
      'x-signature': 'ts=123,v1=abc',
      'x-request-id': 'req-123',
    };

    const isValid = providerNoSecret.verifyWebhook(JSON.stringify(webhookBody), headers);
    assert.strictEqual(isValid, false);
  });

  it('should parse webhook as payment.pending', () => {
    const webhookBody = {
      type: 'payment',
      data: { id: '12345' },
      action: 'payment.created',
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.pending');
    assert.strictEqual(event.payment?.id, '12345');
    assert.strictEqual(event.payment?.status, 'pending');
  });

  it('should throw on unsupported currency', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'EUR',
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
      },
      {
        message: /Currency EUR not supported/,
      }
    );
  });
});
