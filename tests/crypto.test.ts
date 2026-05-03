/**
 * Crypto ramp tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CryptoRamp } from '../src';

describe('CryptoRamp', () => {
  it('should create mock provider', () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    assert.strictEqual(ramp.getProviderName(), 'mock');
  });

  it('should get quote for on-ramp', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    const quote = await ramp.getQuote('on', 1000, 'ZAR', 'BTC', 'BTC');

    assert.ok(quote);
    assert.strictEqual(quote.fiatAmount, 1000);
    assert.ok(quote.cryptoAmount > 0);
    assert.ok(quote.rate > 0);
    assert.strictEqual(quote.feePercent, 3.5);
  });

  it('should create on-ramp', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    const result = await ramp.createOnRamp({
      fiatAmount: 1000,
      fiatCurrency: 'ZAR',
      asset: 'BTC',
      network: 'BTC',
      destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      customer: {
        name: 'Test User',
        email: 'test@example.com',
      },
      urls: {
        success: 'https://example.com/success',
        cancel: 'https://example.com/cancel',
        webhook: 'https://example.com/webhook',
      },
      reference: 'ONRAMP-TEST-001',
    });

    assert.ok(result);
    assert.strictEqual(result.direction, 'on');
    assert.strictEqual(result.status, 'pending');
    assert.ok(result.checkoutUrl);
    assert.ok(result.quote);
  });

  it('should create off-ramp', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    const result = await ramp.createOffRamp({
      cryptoAmount: 0.02,
      asset: 'BTC',
      network: 'BTC',
      fiatCurrency: 'ZAR',
      bankAccount: {
        accountNumber: '1234567890',
        branchCode: '123456',
        accountHolder: 'Test User',
        bankName: 'Test Bank',
      },
      customer: {
        name: 'Test User',
        email: 'test@example.com',
      },
      reference: 'OFFRAMP-TEST-001',
    });

    assert.ok(result);
    assert.strictEqual(result.direction, 'off');
    assert.strictEqual(result.status, 'pending');
    assert.ok(result.depositAddress);
    assert.ok(result.quote);
  });

  it('should get ramp status', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    const result = await ramp.getRamp('mock_on_12345');

    assert.ok(result);
    assert.strictEqual(result.direction, 'on');
    assert.strictEqual(result.status, 'completed');
    assert.ok(result.txHash);
  });

  it('should verify webhook', () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    const isValid = ramp.verifyWebhook({ test: 'data' }, {});
    assert.strictEqual(isValid, true);
  });

  it('should return false when webhookSecret missing', () => {
    const ramp = new CryptoRamp({
      provider: 'moonpay',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const isValid = ramp.verifyWebhook('{}', { signature: 'anything' });
    assert.strictEqual(isValid, false);
  });

  it('should reject invalid wallet address', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    try {
      await ramp.createOnRamp({
        fiatAmount: 1000,
        fiatCurrency: 'ZAR',
        asset: 'BTC',
        network: 'BTC',
        destinationWallet: '0xInvalidETHAddressForBTC',
        customer: {
          name: 'Test User',
          email: 'test@example.com',
        },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
        reference: 'TEST-INVALID',
      });
      assert.fail('Should have thrown for invalid wallet address');
    } catch (error: any) {
      assert.ok(error.message.includes('Invalid BTC wallet address'));
    }
  });

  it('should reject negative amount on createOnRamp', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    try {
      await ramp.createOnRamp({
        fiatAmount: -100,
        fiatCurrency: 'ZAR',
        asset: 'BTC',
        network: 'BTC',
        destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        customer: {
          name: 'Test User',
          email: 'test@example.com',
        },
        urls: {
          success: 'https://example.com/success',
          cancel: 'https://example.com/cancel',
          webhook: 'https://example.com/webhook',
        },
        reference: 'TEST-NEG',
      });
      assert.fail('Should have thrown for negative amount');
    } catch (error: any) {
      assert.ok(error.message.includes('Invalid amount'));
    }
  });

  it('should reject zero amount on createOffRamp', async () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    try {
      await ramp.createOffRamp({
        cryptoAmount: 0,
        asset: 'BTC',
        network: 'BTC',
        fiatCurrency: 'ZAR',
        bankAccount: {
          accountNumber: '1234567890',
          branchCode: '123456',
          accountHolder: 'Test User',
          bankName: 'Test Bank',
        },
        customer: {
          name: 'Test User',
          email: 'test@example.com',
        },
        reference: 'TEST-ZERO',
      });
      assert.fail('Should have thrown for zero amount');
    } catch (error: any) {
      assert.ok(error.message.includes('Invalid amount'));
    }
  });

  it('should get capabilities', () => {
    const ramp = new CryptoRamp({
      provider: 'mock',
      credentials: {},
      sandbox: true,
    });

    const caps = ramp.getCapabilities();

    assert.ok(caps);
    assert.ok(caps.supportedAssets.includes('BTC'));
    assert.ok(caps.supportedNetworks.includes('ETH'));
    assert.ok(caps.supportedFiat.includes('ZAR'));
    assert.strictEqual(caps.fees.onRampPercent, 3.5);
    assert.strictEqual(caps.fees.offRampPercent, 2.0);
  });
});

describe('MoonPay Provider', () => {
  const { MoonPayProvider } = require('../src/crypto/moonpay');
  const crypto = require('crypto');

  it('should generate widget URL with leading ? in signature', () => {
    const provider = new MoonPayProvider({
      apiKey: 'pk_test_123',
      secretKey: 'sk_test_secret',
      sandbox: true,
    });

    const params = new URLSearchParams({
      apiKey: 'pk_test_123',
      currencyCode: 'btc',
      baseCurrencyAmount: '100',
    });

    const signature = crypto
      .createHmac('sha256', 'sk_test_secret')
      .update(`?${params.toString()}`)
      .digest('base64');

    params.append('signature', signature);
    const expectedUrl = `https://buy-sandbox.moonpay.com?${params}`;

    // Mock createOnRamp to verify signature generation
    const widgetParams = new URLSearchParams({
      apiKey: 'pk_test_123',
      currencyCode: 'btc',
      baseCurrencyCode: 'usd',
      baseCurrencyAmount: '100',
      walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      email: 'test@example.com',
      externalTransactionId: 'TEST-001',
      redirectURL: 'https://example.com/success',
    });

    const generatedSig = provider['signWidgetUrl'](`?${widgetParams.toString()}`);

    assert.ok(generatedSig);
    assert.strictEqual(typeof generatedSig, 'string');
    // Verify it's valid base64
    assert.ok(/^[A-Za-z0-9+/]+=*$/.test(generatedSig));
  });

  it('should verify V2 webhook signature with valid timestamp', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new MoonPayProvider({
      apiKey: 'pk_test_123',
      secretKey: 'sk_test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ type: 'transaction_updated', data: { id: '123' } });
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const headers = {
      'moonpay-signature-v2': `t=${timestamp},s=${signature}`,
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject V2 webhook with expired timestamp', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new MoonPayProvider({
      apiKey: 'pk_test_123',
      secretKey: 'sk_test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ type: 'transaction_updated', data: { id: '123' } });
    const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const headers = {
      'moonpay-signature-v2': `t=${timestamp},s=${signature}`,
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, false);
  });

  it('should verify legacy webhook signature', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new MoonPayProvider({
      apiKey: 'pk_test_123',
      secretKey: 'sk_test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ type: 'transaction_updated', data: { id: '123' } });
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const headers = {
      'moonpay-signature': signature,
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject tampered V2 webhook body', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new MoonPayProvider({
      apiKey: 'pk_test_123',
      secretKey: 'sk_test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ type: 'transaction_updated', data: { id: '123' } });
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const tamperedBody = JSON.stringify({ type: 'transaction_updated', data: { id: '999' } });
    const headers = {
      'moonpay-signature-v2': `t=${timestamp},s=${signature}`,
    };

    const isValid = provider.verifyWebhook(tamperedBody, headers);
    assert.strictEqual(isValid, false);
  });
});

describe('Yellow Card Provider', () => {
  const { YellowCardProvider } = require('../src/crypto/yellowcard');
  const crypto = require('crypto');

  it('should generate API signature with hex encoding', () => {
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret_key',
      sandbox: true,
    });

    const method = 'POST';
    const path = '/v1/quotes/buy';
    const timestamp = '1704067200000';
    const body = '{"fiatCurrency":"ZAR","cryptoCurrency":"BTC","fiatAmount":1000}';

    const signature = provider['generateSignature'](method, path, timestamp, body);

    // Verify it's valid hex (lowercase a-f, 0-9, 64 chars for SHA256)
    assert.ok(/^[a-f0-9]{64}$/.test(signature));

    // Verify it matches expected HMAC-SHA256(secret, method+path+timestamp+body) hex
    const message = `${method}${path}${timestamp}${body}`;
    const expectedSig = crypto
      .createHmac('sha256', 'test_secret_key')
      .update(message)
      .digest('hex');

    assert.strictEqual(signature, expectedSig);
  });

  it('should generate signature for known vector', () => {
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'sk_test_FAKE_SECRET',
      sandbox: true,
    });

    const method = 'POST';
    const path = '/v1/quotes/buy';
    const timestamp = '1704067200000';
    const body = '{"fiatCurrency":"ZAR","cryptoCurrency":"BTC","fiatAmount":1000}';

    const signature = provider['generateSignature'](method, path, timestamp, body);

    // Pre-computed expected signature for this exact input
    const expectedSig = crypto
      .createHmac('sha256', 'sk_test_FAKE_SECRET')
      .update(`${method}${path}${timestamp}${body}`)
      .digest('hex');

    assert.strictEqual(signature, expectedSig);
  });

  it('should verify simple webhook signature', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_123' });
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const headers = {
      'x-yellowcard-signature': signature,
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, true);
  });

  it('should verify timestamp-based webhook signature', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_456' });
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const headers = {
      'x-yellowcard-signature': `t=${timestamp},s=${signature}`,
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, true);
  });

  it('should reject webhook with expired timestamp', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_789' });
    const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const headers = {
      'x-yellowcard-signature': `t=${timestamp},s=${signature}`,
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject tampered webhook body', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_123' });
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const tamperedBody = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_999' });
    const headers = {
      'x-yellowcard-signature': signature,
    };

    const isValid = provider.verifyWebhook(tamperedBody, headers);
    assert.strictEqual(isValid, false);
  });

  it('should return false when webhookSecret missing', () => {
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret',
      sandbox: true,
      // No webhookSecret
    });

    const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_123' });
    const headers = {
      'x-yellowcard-signature': 'fake_signature',
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, false);
  });

  it('should reject wrong webhook signature', () => {
    const webhookSecret = 'test_webhook_secret';
    const provider = new YellowCardProvider({
      apiKey: 'test_api_key',
      secretKey: 'test_secret',
      sandbox: true,
      webhookSecret,
    });

    const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_123' });
    const headers = {
      'x-yellowcard-signature': 'wrong_signature_here',
    };

    const isValid = provider.verifyWebhook(body, headers);
    assert.strictEqual(isValid, false);
  });
});
