/**
 * PayFast provider tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { PayFastProvider } from '../src/providers/payfast';

describe('PayFast Provider', () => {
  const config = {
    merchantId: '10000100',
    merchantKey: '46f0cd694581a',
    passphrase: 'jt7NOE43FZPn',
    sandbox: true,
  };

  const provider = new PayFastProvider(config);

  describe('Signature generation', () => {
    it('should generate correct MD5 signature with passphrase', () => {
      const params = {
        merchant_id: '10000100',
        merchant_key: '46f0cd694581a',
        amount: '299.00',
        item_name: 'Test Payment',
      };

      const expectedString = 'merchant_id=10000100&merchant_key=46f0cd694581a&amount=299.00&item_name=Test+Payment&passphrase=jt7NOE43FZPn';
      const expectedSignature = crypto.createHash('md5').update(expectedString).digest('hex');

      const pfEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
      const queryString = Object.entries(params)
        .map(([k, v]) => `${k}=${pfEncode(v)}`)
        .join('&');
      const signatureString = `${queryString}&passphrase=${pfEncode(config.passphrase)}`;
      const actualSignature = crypto.createHash('md5').update(signatureString).digest('hex');

      assert.strictEqual(actualSignature, expectedSignature);
      assert.strictEqual(actualSignature.length, 32);
    });

    it('should encode spaces as + not %20', () => {
      const pfEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');

      assert.strictEqual(pfEncode('John Doe'), 'John+Doe');
      assert.strictEqual(pfEncode('Test Payment'), 'Test+Payment');
      assert.notEqual(pfEncode('Test Payment'), 'Test%20Payment');
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
      assert.strictEqual(payment.provider, 'payfast');
      assert.ok(payment.checkoutUrl.startsWith('https://sandbox.payfast.co.za/eng/process?'));
      assert.ok(payment.checkoutUrl.includes('merchant_id=10000100'));
      assert.ok(payment.checkoutUrl.includes('amount=299.00'));
      assert.ok(payment.checkoutUrl.includes('signature='));

      const signatureMatch = payment.checkoutUrl.match(/signature=([a-f0-9]{32})/);
      assert.ok(signatureMatch, 'Should contain 32-char hex signature');
    });

    it('should include metadata in custom_str fields', async () => {
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
        metadata: {
          userId: '12345',
          plan: 'premium',
        },
      });

      assert.ok(payment.checkoutUrl.includes('custom_str1=12345'));
      assert.ok(payment.checkoutUrl.includes('custom_str2=premium'));
    });

    it('should use production URL when sandbox is false', async () => {
      const prodProvider = new PayFastProvider({
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

      assert.ok(payment.checkoutUrl.startsWith('https://www.payfast.co.za/eng/process?'));
    });
  });

  describe('createSubscription', () => {
    it('should add subscription_type=1 for monthly', async () => {
      const subscription = await provider.createSubscription({
        amount: 299.00,
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

      assert.strictEqual(subscription.status, 'pending');
      assert.strictEqual(subscription.interval, 'monthly');
      assert.ok(subscription.checkoutUrl.includes('subscription_type=1'));
      assert.ok(subscription.checkoutUrl.includes('frequency=3'));
      assert.ok(subscription.checkoutUrl.includes('recurring_amount=299.00'));
      assert.ok(subscription.checkoutUrl.includes('cycles=0'));
    });

    it('should use frequency=6 for yearly', async () => {
      const subscription = await provider.createSubscription({
        amount: 999.00,
        currency: 'ZAR',
        interval: 'yearly',
        reference: 'SUB-002',
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

      assert.ok(subscription.checkoutUrl.includes('frequency=6'));
    });

    it('should reject weekly subscriptions', async () => {
      await assert.rejects(
        async () => {
          await provider.createSubscription({
            amount: 99.00,
            currency: 'ZAR',
            interval: 'weekly' as any,
            reference: 'SUB-003',
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
          message: /PayFast does not support weekly subscriptions/,
        }
      );
    });
  });

  describe('parseWebhook', () => {
    it('should parse form-encoded webhook body', () => {
      const formBody = 'm_payment_id=TEST-001&pf_payment_id=12345&payment_status=COMPLETE&amount_gross=299.00&amount_fee=8.67&amount_net=290.33&signature=abc123';

      const event = provider.parseWebhook(formBody);

      assert.strictEqual(event.type, 'payment.completed');
      assert.strictEqual(event.payment?.status, 'completed');
      assert.strictEqual(event.payment?.amount, 299.00);
      assert.strictEqual(event.payment?.reference, 'TEST-001');
      assert.strictEqual(event.payment?.provider, 'payfast');
    });

    it('should parse object webhook body', () => {
      const objBody = {
        m_payment_id: 'TEST-002',
        pf_payment_id: '67890',
        payment_status: 'FAILED',
        amount_gross: '100.00',
        signature: 'xyz789',
      };

      const event = provider.parseWebhook(objBody);

      assert.strictEqual(event.type, 'payment.failed');
      assert.strictEqual(event.payment?.status, 'failed');
      assert.strictEqual(event.payment?.amount, 100.00);
    });

    it('should map all payment statuses correctly', () => {
      const statuses = [
        { input: 'COMPLETE', expectedType: 'payment.completed', expectedStatus: 'completed' },
        { input: 'FAILED', expectedType: 'payment.failed', expectedStatus: 'failed' },
        { input: 'CANCELLED', expectedType: 'payment.cancelled', expectedStatus: 'cancelled' },
        { input: 'PENDING', expectedType: 'payment.pending', expectedStatus: 'pending' },
      ];

      statuses.forEach(({ input, expectedType, expectedStatus }) => {
        const event = provider.parseWebhook({
          m_payment_id: 'TEST',
          payment_status: input,
          amount_gross: '100.00',
        });

        assert.strictEqual(event.type, expectedType);
        assert.strictEqual(event.payment?.status, expectedStatus);
      });
    });
  });

  describe('verifyWebhook', () => {
    it('should verify valid webhook signature', () => {
      const body = {
        m_payment_id: 'TEST-001',
        pf_payment_id: '12345',
        payment_status: 'COMPLETE',
        amount_gross: '299.00',
      };

      const pfEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
      const params = Object.entries(body)
        .map(([k, v]) => `${k}=${pfEncode(String(v))}`)
        .join('&');
      const signatureString = `${params}&passphrase=${pfEncode(config.passphrase)}`;
      const signature = crypto.createHash('md5').update(signatureString).digest('hex');

      const bodyWithSignature = { ...body, signature };
      const isValid = provider.verifyWebhook(bodyWithSignature);

      assert.strictEqual(isValid, true);
    });

    it('should reject tampered webhook body', () => {
      const body = {
        m_payment_id: 'TEST-001',
        pf_payment_id: '12345',
        payment_status: 'COMPLETE',
        amount_gross: '299.00',
      };

      const pfEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
      const params = Object.entries(body)
        .map(([k, v]) => `${k}=${pfEncode(String(v))}`)
        .join('&');
      const signatureString = `${params}&passphrase=${pfEncode(config.passphrase)}`;
      const signature = crypto.createHash('md5').update(signatureString).digest('hex');

      const tamperedBody = { ...body, amount_gross: '999.00', signature };
      const isValid = provider.verifyWebhook(tamperedBody);

      assert.strictEqual(isValid, false);
    });

    it('should return false when no passphrase configured', () => {
      const noPassphraseProvider = new PayFastProvider({
        merchantId: '10000100',
        merchantKey: '46f0cd694581a',
        sandbox: true,
      });

      const body = {
        m_payment_id: 'TEST-001',
        payment_status: 'COMPLETE',
        amount_gross: '299.00',
        signature: 'some_signature',
      };

      const isValid = noPassphraseProvider.verifyWebhook(body);

      assert.strictEqual(isValid, false);
    });

    it('should verify form-encoded webhook', () => {
      const params = new URLSearchParams({
        m_payment_id: 'TEST-001',
        payment_status: 'COMPLETE',
        amount_gross: '100.00',
      });

      const pfEncode = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
      const paramsString = Array.from(params.entries())
        .map(([k, v]) => `${k}=${pfEncode(v)}`)
        .join('&');
      const signatureString = `${paramsString}&passphrase=${pfEncode(config.passphrase)}`;
      const signature = crypto.createHash('md5').update(signatureString).digest('hex');

      const formBody = `${params.toString()}&signature=${signature}`;
      const isValid = provider.verifyWebhook(formBody);

      assert.strictEqual(isValid, true);
    });
  });

  describe('getCapabilities', () => {
    it('should return PayFast capabilities', () => {
      const capabilities = provider.getCapabilities();

      assert.strictEqual(capabilities.fees.fixed, 2.0);
      assert.strictEqual(capabilities.fees.percent, 2.9);
      assert.strictEqual(capabilities.fees.currency, 'ZAR');
      assert.deepStrictEqual(capabilities.currencies, ['ZAR']);
      assert.strictEqual(capabilities.country, 'ZA');
      assert.strictEqual(capabilities.avgLatencyMs, 600);
    });
  });
});
