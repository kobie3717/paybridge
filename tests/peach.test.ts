/**
 * Peach Payments provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { PeachProvider } from '../src/providers/peach';

describe('PeachProvider', () => {
  let provider: PeachProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new PeachProvider({
      accessToken: 'OGE4Mjk0MTc0YjdlY2IyODAxNGI5Njk5MjIwMDE1Y2N8c3k2S0pzVDg=',
      entityId: '8a8294174b7ecb28014b9699220015ca',
      sandbox: true,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should create payment with form-encoded body', async () => {
    let capturedBody = '';
    let capturedHeaders: any = {};

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';
      capturedHeaders = options?.headers || {};

      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { code: '000.200.100', description: 'successfully created checkout' },
          id: '0287F1EB2C8A4E12B3D5F7C9E4A6B8D0',
          buildNumber: '2024.01.15',
          timestamp: '2026-05-03 10:30:45+0000',
          ndc: 'ABC123',
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

    assert.strictEqual(payment.id, '0287F1EB2C8A4E12B3D5F7C9E4A6B8D0');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.provider, 'peach');

    assert.ok(capturedBody.includes('entityId=8a8294174b7ecb28014b9699220015ca'));
    assert.ok(capturedBody.includes('amount=299.00'));
    assert.ok(capturedBody.includes('paymentType=DB'));
    assert.ok(capturedBody.includes('merchantTransactionId=INV-001'));
    assert.ok(capturedBody.includes('currency=ZAR'));
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer OGE4Mjk0MTc0YjdlY2IyODAxNGI5Njk5MjIwMDE1Y2N8c3k2S0pzVDg=');
    assert.strictEqual(capturedHeaders['Content-Type'], 'application/x-www-form-urlencoded');
  });

  it('should return widget URL with checkoutId query param', async () => {
    (globalThis as any).fetch = async (_url: string, _options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { code: '000.200.100', description: 'successfully created checkout' },
          id: 'CHECKOUT123',
          timestamp: '2026-05-03 10:30:45+0000',
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 100.0,
      currency: 'ZAR',
      reference: 'TEST-001',
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

    assert.strictEqual(
      payment.checkoutUrl,
      'https://eu-test.oppwa.com/v1/paymentWidgets.js?checkoutId=CHECKOUT123'
    );
  });

  it('should throw when result.code is non-success', async () => {
    (globalThis as any).fetch = async (_url: string, _options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { code: '800.100.151', description: 'transaction declined' },
          id: 'FAILED123',
        }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 50.0,
          currency: 'ZAR',
          reference: 'FAIL-001',
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
        message: '800.100.151: transaction declined',
      }
    );
  });

  it('should throw for createSubscription with documented message', async () => {
    await assert.rejects(
      async () => {
        await provider.createSubscription({
          amount: 99.0,
          currency: 'ZAR',
          interval: 'monthly',
          reference: 'SUB-001',
          customer: {
            name: 'Subscriber',
            email: 'subscriber@example.com',
          },
          urls: {
            success: 'https://example.com/success',
            cancel: 'https://example.com/cancel',
            webhook: 'https://example.com/webhook',
          },
        });
      },
      {
        message:
          'Peach Payments subscriptions require Registration + scheduled charges; not yet supported by paybridge. Use Stripe or PayFast for subscriptions.',
      }
    );
  });

  it('should map status codes correctly in getPayment', async () => {
    const testCases = [
      { code: '000.100.110', expectedStatus: 'completed' },
      { code: '000.000.000', expectedStatus: 'completed' },
      { code: '000.200.000', expectedStatus: 'pending' },
      { code: '100.396.101', expectedStatus: 'failed' },
      { code: '000.400.010', expectedStatus: 'cancelled' },
    ];

    for (const { code, expectedStatus } of testCases) {
      (globalThis as any).fetch = async (_url: string, _options?: any): Promise<Response> => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'PAY123',
            amount: '299.00',
            currency: 'ZAR',
            result: { code, description: 'test' },
            merchantTransactionId: 'INV-001',
            timestamp: '2026-05-03 10:30:45+0000',
          }),
        } as any as Response;
      };

      const payment = await provider.getPayment('PAY123');
      assert.strictEqual(payment.status, expectedStatus, `Failed for code ${code}`);
    }
  });

  it('should refund with paymentType=RF', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedUrl = url;
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { code: '000.100.110', description: 'Request successfully processed' },
          id: 'REFUND123',
          amount: '50.00',
          currency: 'ZAR',
          timestamp: '2026-05-03 11:00:00+0000',
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'PAYMENT123',
      amount: 50.0,
    });

    assert.strictEqual(refund.id, 'REFUND123');
    assert.strictEqual(refund.status, 'completed');
    assert.strictEqual(refund.amount, 50.0);
    assert.ok(capturedUrl.includes('/v1/payments/PAYMENT123'));
    assert.ok(capturedBody.includes('paymentType=RF'));
    assert.ok(capturedBody.includes('amount=50.00'));
  });

  it('should parse encrypted webhook body', async () => {
    const webhookSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const providerWithSecret = new PeachProvider({
      accessToken: 'test',
      entityId: 'test',
      sandbox: true,
      webhookSecret,
    });

    const plaintext = JSON.stringify({
      type: 'PAYMENT',
      payload: {
        id: 'PAY123',
        amount: '299.00',
        currency: 'ZAR',
        result: { code: '000.100.110', description: 'success' },
        merchantTransactionId: 'INV-001',
      },
    });

    const key = Buffer.from(webhookSecret, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const headers = {
      'x-initialization-vector': iv.toString('hex'),
      'x-authentication-tag': authTag.toString('hex'),
    };

    const encryptedBody = ciphertext.toString('hex');

    const webhookEvent = providerWithSecret.parseWebhook(encryptedBody, headers);

    assert.strictEqual(webhookEvent.type, 'payment.completed');
    assert.strictEqual(webhookEvent.payment?.id, 'PAY123');
    assert.strictEqual(webhookEvent.payment?.amount, 299.0);
    assert.strictEqual(webhookEvent.payment?.reference, 'INV-001');
  });

  it('should verify webhook returns true for valid encrypted body', () => {
    const webhookSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const providerWithSecret = new PeachProvider({
      accessToken: 'test',
      entityId: 'test',
      sandbox: true,
      webhookSecret,
    });

    const plaintext = JSON.stringify({ test: 'data' });
    const key = Buffer.from(webhookSecret, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const headers = {
      'x-initialization-vector': iv.toString('hex'),
      'x-authentication-tag': authTag.toString('hex'),
    };

    const encryptedBody = ciphertext.toString('hex');
    const isValid = providerWithSecret.verifyWebhook(encryptedBody, headers);

    assert.strictEqual(isValid, true);
  });

  it('should verify webhook returns false for tampered ciphertext', () => {
    const webhookSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const providerWithSecret = new PeachProvider({
      accessToken: 'test',
      entityId: 'test',
      sandbox: true,
      webhookSecret,
    });

    const plaintext = JSON.stringify({ test: 'data' });
    const key = Buffer.from(webhookSecret, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const tamperedCiphertext = Buffer.from(ciphertext);
    tamperedCiphertext[0] = (tamperedCiphertext[0] + 1) % 256;

    const headers = {
      'x-initialization-vector': iv.toString('hex'),
      'x-authentication-tag': authTag.toString('hex'),
    };

    const encryptedBody = tamperedCiphertext.toString('hex');
    const isValid = providerWithSecret.verifyWebhook(encryptedBody, headers);

    assert.strictEqual(isValid, false);
  });

  it('should verify webhook returns false for missing secret', () => {
    const providerNoSecret = new PeachProvider({
      accessToken: 'test',
      entityId: 'test',
      sandbox: true,
    });

    const isValid = providerNoSecret.verifyWebhook('anydata', {
      'x-initialization-vector': 'abc123',
      'x-authentication-tag': 'def456',
    });

    assert.strictEqual(isValid, false);
  });

  it('should throw when currency validation fails', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'NGN',
          reference: 'TEST-001',
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
        message: 'Currency NGN not supported by peach. Supported: ZAR, USD, EUR, GBP',
      }
    );
  });

  // ==================== Group A: Refund tests ====================

  it('should refund without amount (full refund)', async () => {
    let capturedBody = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = options?.body || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { code: '000.100.110', description: 'Request successfully processed' },
          id: 'REFUND-FULL',
          amount: '299.00',
          currency: 'ZAR',
        }),
      } as any as Response;
    };

    await provider.refund({
      paymentId: 'PAY-FULL',
    });

    // Form-encoded, should NOT contain amount= for full refund
    assert.ok(!capturedBody.includes('amount='));
    assert.ok(capturedBody.includes('paymentType=RF'));
  });

  // Note: Peach refund API does not support reason/merchantMemo field

  // ==================== Group B: Error path tests ====================

  it('should throw HttpError on 400 response', async () => {
    const { HttpError } = await import('../src/utils/fetch');

    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map() as any,
        text: async () => JSON.stringify({
          result: { code: '100.100.101', description: 'invalid payment data' },
        }),
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
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
        await provider.refund({ paymentId: 'PAY-500' });
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
      throw new FetchTimeoutError('https://eu-test.oppwa.com/v1/checkouts', 30000);
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
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
        headers: new Map() as any,
        text: async () => 'Rate limit exceeded',
      } as any as Response;
    };

    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 100.0,
          currency: 'ZAR',
          reference: 'RATE',
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

  // ==================== Group E: Currency edge cases ====================
  // Note: Amount validation (0, negative, NaN, Infinity) is done by the Router, not providers.

  it('should throw on lowercase currency (case-sensitive validation)', async () => {
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
