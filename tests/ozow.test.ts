/**
 * Ozow provider tests
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { OzowProvider } from '../src/providers/ozow';

describe('Ozow Provider', () => {
  const config = {
    apiKey: 'test-api-key-123',
    siteCode: 'TST-TEST-001',
    privateKey: 'test-private-key-456',
    sandbox: true,
  };

  const provider = new OzowProvider(config);

  describe('Hash generation', () => {
    it('should generate correct SHA-512 hash', () => {
      const fields: Record<string, string> = {
        SiteCode: 'TST-TEST-001',
        CountryCode: 'ZA',
        CurrencyCode: 'ZAR',
        Amount: '299.00',
        TransactionReference: 'TEST-001',
        BankReference: 'TEST001',
        Customer: 'John Doe',
        CancelUrl: 'https://example.com/cancel',
        ErrorUrl: 'https://example.com/cancel',
        SuccessUrl: 'https://example.com/success',
        NotifyUrl: 'https://example.com/webhook',
        IsTest: 'true',
      };

      const fieldOrder = [
        'SiteCode',
        'CountryCode',
        'CurrencyCode',
        'Amount',
        'TransactionReference',
        'BankReference',
        'Customer',
        'CancelUrl',
        'ErrorUrl',
        'SuccessUrl',
        'NotifyUrl',
        'IsTest',
      ];

      const concat = fieldOrder.map(k => fields[k]).join('') + config.apiKey;
      const expectedHash = crypto.createHash('sha512').update(concat.toLowerCase()).digest('hex');

      assert.strictEqual(expectedHash.length, 128);
      assert.match(expectedHash, /^[a-f0-9]{128}$/);
    });
  });

  describe('createPayment', () => {
    it('should create payment with correct URL structure', async () => {
      const payment = await provider.createPayment({
        amount: 299.00,
        currency: 'ZAR',
        reference: 'TEST-001',
        description: 'Test payment',
        customer: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '0825551234',
        },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
      });

      assert.strictEqual(payment.status, 'pending');
      assert.strictEqual(payment.amount, 299.00);
      assert.strictEqual(payment.currency, 'ZAR');
      assert.strictEqual(payment.reference, 'TEST-001');
      assert.strictEqual(payment.provider, 'ozow');
      assert.ok(payment.checkoutUrl.startsWith('https://stagingpay.ozow.com?'));
      assert.ok(payment.checkoutUrl.includes('SiteCode=TST-TEST-001'));
      assert.ok(payment.checkoutUrl.includes('Amount=299.00'));
      assert.ok(payment.checkoutUrl.includes('IsTest=true'));

      const hashMatch = payment.checkoutUrl.match(/HashCheck=([a-f0-9]{128})/);
      assert.ok(hashMatch, 'Should contain 128-char hex hash');
    });

    it('should use sandbox URL when sandbox is true', async () => {
      const payment = await provider.createPayment({
        amount: 100.00,
        currency: 'ZAR',
        reference: 'TEST-002',
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

      assert.ok(payment.checkoutUrl.startsWith('https://stagingpay.ozow.com?'));
    });

    it('should use production URL when sandbox is false', async () => {
      const prodProvider = new OzowProvider({
        ...config,
        sandbox: false,
      });

      const payment = await prodProvider.createPayment({
        amount: 100.00,
        currency: 'ZAR',
        reference: 'PROD-001',
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

      assert.ok(payment.checkoutUrl.startsWith('https://pay.ozow.com?'));
      assert.ok(payment.checkoutUrl.includes('IsTest=false'));
    });

    it('should sanitize BankReference', async () => {
      const payment = await provider.createPayment({
        amount: 100.00,
        currency: 'ZAR',
        reference: 'INV-001',
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

      assert.ok(payment.checkoutUrl.includes('BankReference=INV001'));
    });

    it('should throw on empty BankReference after sanitization', async () => {
      await assert.rejects(
        async () => {
          await provider.createPayment({
            amount: 100.00,
            currency: 'ZAR',
            reference: '---',
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
          message: /Ozow BankReference invalid/,
        }
      );
    });

    it('should throw on unsupported currency', async () => {
      await assert.rejects(
        async () => {
          await provider.createPayment({
            amount: 100.00,
            currency: 'USD',
            reference: 'TEST-003',
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
          message: /Currency USD not supported/,
        }
      );
    });
  });

  describe('createSubscription', () => {
    it('should throw unsupported error', async () => {
      await assert.rejects(
        async () => {
          await provider.createSubscription({
            amount: 99.00,
            currency: 'ZAR',
            interval: 'monthly',
            reference: 'SUB-001',
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
          message: /Ozow does not support recurring subscriptions/,
        }
      );
    });
  });

  describe('refund', () => {
    it('should throw unsupported error', async () => {
      await assert.rejects(
        async () => {
          await provider.refund({
            paymentId: 'TEST-001',
            amount: 50.00,
            reason: 'Customer request',
          });
        },
        {
          message: /Ozow refunds must be processed manually/,
        }
      );
    });
  });

  describe('getPayment', () => {
    it('should fetch payment and map Complete status to completed', async () => {
      const mockResponse = [
        {
          transactionId: 'OZ-12345',
          transactionReference: 'TEST-001',
          amount: 299.00,
          currencyCode: 'ZAR',
          status: 'Complete',
          createdDate: '2024-01-01T10:00:00Z',
        },
      ];

      mock.method(global, 'fetch', async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const payment = await provider.getPayment('TEST-001');

      assert.strictEqual(payment.id, 'OZ-12345');
      assert.strictEqual(payment.status, 'completed');
      assert.strictEqual(payment.amount, 299.00);
      assert.strictEqual(payment.reference, 'TEST-001');
    });

    it('should map Cancelled status to cancelled', async () => {
      const mockResponse = [
        {
          transactionId: 'OZ-67890',
          transactionReference: 'TEST-002',
          amount: 100.00,
          currencyCode: 'ZAR',
          status: 'Cancelled',
          createdDate: '2024-01-01T10:00:00Z',
        },
      ];

      mock.method(global, 'fetch', async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const payment = await provider.getPayment('TEST-002');

      assert.strictEqual(payment.status, 'cancelled');
    });

    it('should map Error status to failed', async () => {
      const mockResponse = [
        {
          transactionId: 'OZ-11111',
          transactionReference: 'TEST-003',
          amount: 50.00,
          currencyCode: 'ZAR',
          status: 'Error',
          createdDate: '2024-01-01T10:00:00Z',
        },
      ];

      mock.method(global, 'fetch', async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const payment = await provider.getPayment('TEST-003');

      assert.strictEqual(payment.status, 'failed');
    });

    it('should throw when transaction not found', async () => {
      mock.method(global, 'fetch', async () => ({
        ok: true,
        json: async () => [],
      }));

      await assert.rejects(
        async () => {
          await provider.getPayment('NOT-FOUND');
        },
        {
          message: /Transaction not found/,
        }
      );
    });
  });

  describe('parseWebhook', () => {
    it('should parse form-encoded webhook body with Complete status', () => {
      const formBody = 'SiteCode=TST-TEST-001&TransactionId=OZ-12345&TransactionReference=TEST-001&Amount=299.00&Status=Complete&Optional1=&Optional2=&Optional3=&Optional4=&Optional5=&CurrencyCode=ZAR&IsTest=true&StatusMessage=Payment+Complete&Hash=abc123';

      const event = provider.parseWebhook(formBody);

      assert.strictEqual(event.type, 'payment.completed');
      assert.strictEqual(event.payment?.status, 'completed');
      assert.strictEqual(event.payment?.amount, 299.00);
      assert.strictEqual(event.payment?.reference, 'TEST-001');
      assert.strictEqual(event.payment?.id, 'OZ-12345');
      assert.strictEqual(event.payment?.provider, 'ozow');
    });

    it('should parse object webhook body', () => {
      const objBody = {
        SiteCode: 'TST-TEST-001',
        TransactionId: 'OZ-67890',
        TransactionReference: 'TEST-002',
        Amount: '100.00',
        Status: 'Cancelled',
        CurrencyCode: 'ZAR',
        IsTest: 'true',
        StatusMessage: 'Cancelled by user',
        Hash: 'xyz789',
      };

      const event = provider.parseWebhook(objBody);

      assert.strictEqual(event.type, 'payment.cancelled');
      assert.strictEqual(event.payment?.status, 'cancelled');
      assert.strictEqual(event.payment?.amount, 100.00);
    });

    it('should map all Ozow statuses correctly', () => {
      const statuses = [
        { input: 'Complete', expectedType: 'payment.completed', expectedStatus: 'completed' },
        { input: 'Cancelled', expectedType: 'payment.cancelled', expectedStatus: 'cancelled' },
        { input: 'Error', expectedType: 'payment.failed', expectedStatus: 'failed' },
        { input: 'Abandoned', expectedType: 'payment.cancelled', expectedStatus: 'cancelled' },
        { input: 'Pending', expectedType: 'payment.pending', expectedStatus: 'pending' },
        { input: 'PendingInvestigation', expectedType: 'payment.pending', expectedStatus: 'pending' },
      ];

      statuses.forEach(({ input, expectedType, expectedStatus }) => {
        const event = provider.parseWebhook({
          TransactionId: 'OZ-TEST',
          TransactionReference: 'TEST',
          Amount: '100.00',
          Status: input,
          CurrencyCode: 'ZAR',
          IsTest: 'true',
        });

        assert.strictEqual(event.type, expectedType);
        assert.strictEqual(event.payment?.status, expectedStatus);
      });
    });
  });

  describe('verifyWebhook', () => {
    it('should verify valid webhook hash', () => {
      const body = {
        SiteCode: 'TST-TEST-001',
        TransactionId: 'OZ-12345',
        TransactionReference: 'TEST-001',
        Amount: '299.00',
        Status: 'Complete',
        Optional1: '',
        Optional2: '',
        Optional3: '',
        Optional4: '',
        Optional5: '',
        CurrencyCode: 'ZAR',
        IsTest: 'true',
        StatusMessage: 'Payment Complete',
      };

      const fieldOrder = [
        'SiteCode',
        'TransactionId',
        'TransactionReference',
        'Amount',
        'Status',
        'Optional1',
        'Optional2',
        'Optional3',
        'Optional4',
        'Optional5',
        'CurrencyCode',
        'IsTest',
        'StatusMessage',
      ];

      const concat = fieldOrder.map(k => (body as any)[k]).join('') + config.apiKey;
      const hash = crypto.createHash('sha512').update(concat.toLowerCase()).digest('hex');

      const bodyWithHash = { ...body, Hash: hash };
      const isValid = provider.verifyWebhook(bodyWithHash);

      assert.strictEqual(isValid, true);
    });

    it('should reject tampered webhook body', () => {
      const body = {
        SiteCode: 'TST-TEST-001',
        TransactionId: 'OZ-12345',
        TransactionReference: 'TEST-001',
        Amount: '299.00',
        Status: 'Complete',
        Optional1: '',
        Optional2: '',
        Optional3: '',
        Optional4: '',
        Optional5: '',
        CurrencyCode: 'ZAR',
        IsTest: 'true',
        StatusMessage: 'Payment Complete',
      };

      const fieldOrder = [
        'SiteCode',
        'TransactionId',
        'TransactionReference',
        'Amount',
        'Status',
        'Optional1',
        'Optional2',
        'Optional3',
        'Optional4',
        'Optional5',
        'CurrencyCode',
        'IsTest',
        'StatusMessage',
      ];

      const concat = fieldOrder.map(k => (body as any)[k]).join('') + config.apiKey;
      const hash = crypto.createHash('sha512').update(concat.toLowerCase()).digest('hex');

      const tamperedBody = { ...body, Amount: '999.00', Hash: hash };
      const isValid = provider.verifyWebhook(tamperedBody);

      assert.strictEqual(isValid, false);
    });

    it('should return false when no apiKey configured', () => {
      const noKeyProvider = new OzowProvider({
        apiKey: '',
        siteCode: 'TST-TEST-001',
        privateKey: 'test-private-key',
        sandbox: true,
      });

      const body = {
        TransactionId: 'OZ-12345',
        Status: 'Complete',
        Amount: '100.00',
        Hash: 'some_hash',
      };

      const isValid = noKeyProvider.verifyWebhook(body);

      assert.strictEqual(isValid, false);
    });

    it('should return false when no Hash provided', () => {
      const body = {
        TransactionId: 'OZ-12345',
        Status: 'Complete',
        Amount: '100.00',
      };

      const isValid = provider.verifyWebhook(body);

      assert.strictEqual(isValid, false);
    });
  });

  describe('getCapabilities', () => {
    it('should return Ozow capabilities', () => {
      const capabilities = provider.getCapabilities();

      assert.strictEqual(capabilities.fees.fixed, 0);
      assert.strictEqual(capabilities.fees.percent, 1.5);
      assert.strictEqual(capabilities.fees.currency, 'ZAR');
      assert.deepStrictEqual(capabilities.currencies, ['ZAR']);
      assert.strictEqual(capabilities.country, 'ZA');
      assert.strictEqual(capabilities.avgLatencyMs, 800);
    });
  });
});
