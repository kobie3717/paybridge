/**
 * Razorpay provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { RazorpayProvider } from '../src/providers/razorpay';

describe('RazorpayProvider', () => {
  let provider: RazorpayProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new RazorpayProvider({
      keyId: 'rzp_test_123456789',
      keySecret: 'test_secret_key',
      webhookSecret: 'test_webhook_secret',
      sandbox: true,
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create payment order with Basic auth', async () => {
    let capturedHeaders: any;
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedHeaders = options?.headers || {};
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'order_abc123',
          amount: 29900,
          currency: 'INR',
          receipt: 'INV-001',
          created_at: Math.floor(Date.now() / 1000),
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'INR',
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

    assert.strictEqual(payment.id, 'order_abc123');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'INR');

    const expectedAuth = 'Basic ' + Buffer.from('rzp_test_123456789:test_secret_key').toString('base64');
    assert.strictEqual(capturedHeaders['Authorization'], expectedAuth);

    assert.strictEqual(capturedBody.amount, 29900);
    assert.strictEqual(capturedBody.currency, 'INR');
    assert.strictEqual(capturedBody.receipt, 'INV-001');
    assert.strictEqual(capturedBody.notes.customerEmail, 'john@example.com');
  });

  it('should return embedded checkout URL with key_id and order_id', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'order_xyz789',
          amount: 29900,
          currency: 'INR',
          receipt: 'INV-002',
          created_at: Math.floor(Date.now() / 1000),
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'INR',
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

    assert.ok(payment.checkoutUrl.includes('key_id=rzp_test_123456789'));
    assert.ok(payment.checkoutUrl.includes('order_id=order_xyz789'));
  });

  it('should create subscription with two-step flow', async () => {
    let planCaptured = false;
    let subscriptionCaptured = false;
    let planBody: any;
    let subscriptionBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/plans')) {
        planCaptured = true;
        planBody = JSON.parse(options?.body || '{}');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'plan_123',
            period: 'monthly',
            interval: 1,
            item: {
              amount: 29900,
              currency: 'INR',
            },
          }),
        } as any as Response;
      } else if (url.includes('/subscriptions')) {
        subscriptionCaptured = true;
        subscriptionBody = JSON.parse(options?.body || '{}');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sub_456',
            plan_id: 'plan_123',
            created_at: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const subscription = await provider.createSubscription({
      amount: 299.0,
      currency: 'INR',
      interval: 'monthly',
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

    assert.strictEqual(planCaptured, true);
    assert.strictEqual(subscriptionCaptured, true);
    assert.strictEqual(planBody.period, 'monthly');
    assert.strictEqual(planBody.interval, 1);
    assert.strictEqual(subscriptionBody.plan_id, 'plan_123');
    assert.strictEqual(subscription.id, 'sub_456');
  });

  it('should map weekly to weekly period', async () => {
    let planBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/plans')) {
        planBody = JSON.parse(options?.body || '{}');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'plan_weekly',
            period: 'weekly',
          }),
        } as any as Response;
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sub_weekly',
            created_at: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }
    };

    await provider.createSubscription({
      amount: 99.0,
      currency: 'INR',
      interval: 'weekly',
      reference: 'SUB-WEEKLY',
      customer: {
        name: 'Alice Doe',
        email: 'alice@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
    });

    assert.strictEqual(planBody.period, 'weekly');
  });

  it('should map yearly to yearly period', async () => {
    let planBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/plans')) {
        planBody = JSON.parse(options?.body || '{}');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'plan_yearly',
            period: 'yearly',
          }),
        } as any as Response;
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sub_yearly',
            created_at: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }
    };

    await provider.createSubscription({
      amount: 999.0,
      currency: 'INR',
      interval: 'yearly',
      reference: 'SUB-YEARLY',
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

    assert.strictEqual(planBody.period, 'yearly');
  });

  it('should map payment captured status to completed', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'pay_123',
              status: 'captured',
              amount: 29900,
              currency: 'INR',
              order_id: 'order_abc',
              created_at: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('order_abc');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.id, 'pay_123');
  });

  it('should map payment failed status to failed', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'pay_456',
              status: 'failed',
              amount: 29900,
              currency: 'INR',
              order_id: 'order_xyz',
              created_at: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('order_xyz');
    assert.strictEqual(payment.status, 'failed');
  });

  it('should return pending when order has no payments', async () => {
    (globalThis as any).fetch = async (url: string): Promise<Response> => {
      if (url.includes('/payments')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
          }),
        } as any as Response;
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'order_pending',
            amount: 29900,
            currency: 'INR',
            receipt: 'INV-999',
            created_at: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }
    };

    const payment = await provider.getPayment('order_pending');
    assert.strictEqual(payment.status, 'pending');
  });

  it('should resolve order_id to payment_id for refunds', async () => {
    let refundUrl = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      if (url.includes('/orders/order_123/payments')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'pay_abc',
                amount: 29900,
              },
            ],
          }),
        } as any as Response;
      } else if (url.includes('/refund')) {
        refundUrl = url;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'rfnd_123',
            status: 'processed',
            amount: 29900,
            currency: 'INR',
            created_at: Math.floor(Date.now() / 1000),
          }),
        } as any as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const refund = await provider.refund({
      paymentId: 'order_123',
      amount: 299.0,
    });

    assert.ok(refundUrl.includes('/payments/pay_abc/refund'));
    assert.strictEqual(refund.id, 'rfnd_123');
    assert.strictEqual(refund.status, 'completed');
  });

  it('should POST refund directly if paymentId is payment_id', async () => {
    let refundUrl = '';

    (globalThis as any).fetch = async (url: string): Promise<Response> => {
      refundUrl = url;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rfnd_456',
          status: 'processed',
          amount: 29900,
          currency: 'INR',
          created_at: Math.floor(Date.now() / 1000),
        }),
      } as any as Response;
    };

    await provider.refund({
      paymentId: 'pay_direct123',
      amount: 299.0,
    });

    assert.ok(refundUrl.includes('/payments/pay_direct123/refund'));
  });

  it('should verify webhook with valid HMAC', () => {
    const webhookBody = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            amount: 29900,
            currency: 'INR',
          },
        },
      },
    };

    const bodyStr = JSON.stringify(webhookBody);
    const validSig = crypto.createHmac('sha256', 'test_webhook_secret').update(bodyStr, 'utf8').digest('hex');

    const headers = {
      'x-razorpay-signature': validSig,
    };

    const isValid = provider.verifyWebhook(bodyStr, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with wrong HMAC', () => {
    const webhookBody = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
          },
        },
      },
    };

    const headers = {
      'x-razorpay-signature': 'wrongsignature',
    };

    const isValid = provider.verifyWebhook(JSON.stringify(webhookBody), headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhookSecret missing', () => {
    const providerNoSecret = new RazorpayProvider({
      keyId: 'rzp_test_123456789',
      keySecret: 'test_secret_key',
      sandbox: true,
    });

    const webhookBody = {
      event: 'payment.captured',
      payload: {},
    };

    const headers = {
      'x-razorpay-signature': 'somesig',
    };

    const isValid = providerNoSecret.verifyWebhook(JSON.stringify(webhookBody), headers);
    assert.strictEqual(isValid, false);
  });

  it('should parse payment.captured as payment.completed', () => {
    const webhookBody = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            amount: 29900,
            currency: 'INR',
            order_id: 'order_abc',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.completed');
    assert.strictEqual(event.payment?.id, 'pay_123');
    assert.strictEqual(event.payment?.status, 'completed');
    assert.strictEqual(event.payment?.amount, 299.0);
  });

  it('should parse payment.failed as payment.failed', () => {
    const webhookBody = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_456',
            amount: 29900,
            currency: 'INR',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.failed');
    assert.strictEqual(event.payment?.status, 'failed');
  });

  it('should parse refund.processed as refund.completed', () => {
    const webhookBody = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_123',
            amount: 29900,
            currency: 'INR',
            payment_id: 'pay_abc',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'refund.completed');
    assert.strictEqual(event.refund?.id, 'rfnd_123');
    assert.strictEqual(event.refund?.status, 'completed');
    assert.strictEqual(event.refund?.amount, 299.0);
    assert.strictEqual(event.refund?.paymentId, 'pay_abc');
  });

  it('should throw on unsupported currency', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'BRL',
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
        message: /Currency BRL not supported/,
      }
    );
  });
});
