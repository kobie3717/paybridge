/**
 * Adyen provider tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { AdyenProvider } from '../src/providers/adyen';
import { toMinorUnit } from '../src/utils/currency';

describe('AdyenProvider', () => {
  let provider: AdyenProvider;
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<string, any>;

  beforeEach(() => {
    provider = new AdyenProvider({
      apiKey: 'test_api_key',
      merchantAccount: 'TestMerchant',
      sandbox: true,
      webhookSecret: '4468D9782DEF547AAC35478E2527211AD5C3EF39C8ACDB5DE7D8A688D2615AF1',
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

  it('should create payment with minor units', async () => {
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'CSCBC123',
          url: 'https://checkoutshopper-test.adyen.com/checkout/v3?sessionId=CSCBC123',
          sessionData: 'sessiondata...',
          amount: { value: 29900, currency: 'ZAR' },
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

    assert.strictEqual(payment.id, 'CSCBC123');
    assert.strictEqual(payment.status, 'pending');
    assert.strictEqual(payment.amount, 299.0);
    assert.strictEqual(payment.currency, 'ZAR');

    assert.strictEqual(capturedBody.amount.value, 29900);
    assert.strictEqual(capturedBody.amount.currency, 'ZAR');
    assert.strictEqual(capturedBody.merchantAccount, 'TestMerchant');
    assert.strictEqual(capturedBody.reference, 'INV-001');
    assert.strictEqual(capturedBody.shopperEmail, 'john@example.com');
    assert.strictEqual(capturedBody.shopperName.firstName, 'John');
    assert.strictEqual(capturedBody.shopperName.lastName, 'Doe');
  });

  it('should return checkoutUrl from response url', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'CSCBC456',
          url: 'https://checkoutshopper-test.adyen.com/checkout/v3?sessionId=CSCBC456',
          amount: { value: 29900, currency: 'ZAR' },
        }),
      } as any as Response;
    };

    const payment = await provider.createPayment({
      amount: 299.0,
      currency: 'ZAR',
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

    assert.strictEqual(payment.checkoutUrl, 'https://checkoutshopper-test.adyen.com/checkout/v3?sessionId=CSCBC456');
  });

  it('should throw on createSubscription', async () => {
    await assert.rejects(
      async () => {
        await provider.createSubscription({
          amount: 299.0,
          currency: 'ZAR',
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
      },
      {
        message: /Adyen subscriptions require recurring tokenization flow/,
      }
    );
  });

  it('should map session status completed', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'CSCBC123',
          status: 'completed',
          url: 'https://checkoutshopper-test.adyen.com/checkout/v3?sessionId=CSCBC123',
          amount: { value: 29900, currency: 'ZAR' },
          reference: 'INV-001',
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('CSCBC123');

    assert.strictEqual(payment.status, 'completed');
    assert.strictEqual(payment.amount, 299.0);
  });

  it('should map session status paymentPending to pending', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'CSCBC123',
          status: 'paymentPending',
          amount: { value: 29900, currency: 'ZAR' },
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('CSCBC123');
    assert.strictEqual(payment.status, 'pending');
  });

  it('should map session status refused to failed', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'CSCBC123',
          status: 'refused',
          amount: { value: 29900, currency: 'ZAR' },
        }),
      } as any as Response;
    };

    const payment = await provider.getPayment('CSCBC123');
    assert.strictEqual(payment.status, 'failed');
  });

  it('should POST refund to correct endpoint', async () => {
    let capturedUrl = '';
    let capturedBody: any;

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      capturedUrl = url;
      capturedBody = JSON.parse(options?.body || '{}');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          pspReference: 'REF123',
          status: 'received',
          amount: { value: 29900, currency: 'EUR' },
        }),
      } as any as Response;
    };

    const refund = await provider.refund({
      paymentId: 'PAY123',
      amount: 299.0,
    });

    assert.ok(capturedUrl.includes('/payments/PAY123/refunds'));
    assert.strictEqual(capturedBody.merchantAccount, 'TestMerchant');
    assert.strictEqual(refund.id, 'REF123');
    assert.strictEqual(refund.status, 'pending');
  });

  it('should verify webhook with valid HMAC', () => {
    const webhookBody = {
      live: 'false',
      notificationItems: [
        {
          NotificationRequestItem: {
            pspReference: 'PSP123',
            originalReference: '',
            merchantAccountCode: 'TestMerchant',
            merchantReference: 'INV-001',
            amount: { value: 29900, currency: 'ZAR' },
            eventCode: 'AUTHORISATION',
            success: 'true',
            additionalData: {
              hmacSignature: '',
            },
          },
        },
      ],
    };

    const item = webhookBody.notificationItems[0].NotificationRequestItem;
    const signedFields = [
      item.pspReference,
      item.originalReference,
      item.merchantAccountCode,
      item.merchantReference,
      String(item.amount.value),
      item.amount.currency,
      item.eventCode,
      item.success,
    ];

    const signedString = signedFields.join('|');
    const hmacKey = Buffer.from('4468D9782DEF547AAC35478E2527211AD5C3EF39C8ACDB5DE7D8A688D2615AF1', 'hex');
    const validSig = crypto.createHmac('sha256', hmacKey).update(signedString, 'utf8').digest('base64');

    item.additionalData.hmacSignature = validSig;

    const isValid = provider.verifyWebhook(JSON.stringify(webhookBody));
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with tampered HMAC', () => {
    const webhookBody = {
      live: 'false',
      notificationItems: [
        {
          NotificationRequestItem: {
            pspReference: 'PSP123',
            originalReference: '',
            merchantAccountCode: 'TestMerchant',
            merchantReference: 'INV-001',
            amount: { value: 29900, currency: 'ZAR' },
            eventCode: 'AUTHORISATION',
            success: 'true',
            additionalData: {
              hmacSignature: 'tamperedSignature==',
            },
          },
        },
      ],
    };

    const isValid = provider.verifyWebhook(JSON.stringify(webhookBody));
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhookSecret missing', () => {
    const providerNoSecret = new AdyenProvider({
      apiKey: 'test_api_key',
      merchantAccount: 'TestMerchant',
      sandbox: true,
    });

    const webhookBody = {
      live: 'false',
      notificationItems: [
        {
          NotificationRequestItem: {
            pspReference: 'PSP123',
            eventCode: 'AUTHORISATION',
            success: 'true',
            amount: { value: 29900, currency: 'ZAR' },
            additionalData: {
              hmacSignature: 'someSignature',
            },
          },
        },
      ],
    };

    const isValid = providerNoSecret.verifyWebhook(JSON.stringify(webhookBody));
    assert.strictEqual(isValid, false);
  });

  it('should parse webhook AUTHORISATION success as payment.completed', () => {
    const webhookBody = {
      live: 'false',
      notificationItems: [
        {
          NotificationRequestItem: {
            pspReference: 'PSP123',
            merchantReference: 'INV-001',
            amount: { value: 29900, currency: 'ZAR' },
            eventCode: 'AUTHORISATION',
            success: 'true',
          },
        },
      ],
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.completed');
    assert.strictEqual(event.payment?.id, 'PSP123');
    assert.strictEqual(event.payment?.status, 'completed');
    assert.strictEqual(event.payment?.amount, 299.0);
    assert.strictEqual(event.payment?.reference, 'INV-001');
  });

  it('should parse webhook AUTHORISATION failure as payment.failed', () => {
    const webhookBody = {
      live: 'false',
      notificationItems: [
        {
          NotificationRequestItem: {
            pspReference: 'PSP456',
            merchantReference: 'INV-002',
            amount: { value: 29900, currency: 'ZAR' },
            eventCode: 'AUTHORISATION',
            success: 'false',
          },
        },
      ],
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'payment.failed');
    assert.strictEqual(event.payment?.status, 'failed');
  });

  it('should parse webhook REFUND as refund.completed', () => {
    const webhookBody = {
      live: 'false',
      notificationItems: [
        {
          NotificationRequestItem: {
            pspReference: 'REF123',
            originalReference: 'PSP123',
            amount: { value: 29900, currency: 'ZAR' },
            eventCode: 'REFUND',
            success: 'true',
          },
        },
      ],
    };

    const event = provider.parseWebhook(webhookBody);

    assert.strictEqual(event.type, 'refund.completed');
    assert.strictEqual(event.refund?.id, 'REF123');
    assert.strictEqual(event.refund?.status, 'completed');
    assert.strictEqual(event.refund?.amount, 299.0);
    assert.strictEqual(event.refund?.paymentId, 'PSP123');
  });

  it('should throw on unsupported currency', async () => {
    await assert.rejects(
      async () => {
        await provider.createPayment({
          amount: 299.0,
          currency: 'XYZ',
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
        message: /Currency XYZ not supported/,
      }
    );
  });
});
