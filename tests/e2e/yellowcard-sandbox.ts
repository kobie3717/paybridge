/**
 * Yellow Card E2E Sandbox Harness
 *
 * Runs vector tests, spec replication, webhook roundtrip, and optional live sandbox calls.
 *
 * WARNING: Yellow Card API spec is UNVERIFIED. No official documentation was found.
 * Tests validate internal consistency but cannot confirm correctness against real API.
 *
 * Usage:
 *   npx tsx tests/e2e/yellowcard-sandbox.ts
 *   YELLOWCARD_API_KEY=xxx YELLOWCARD_SECRET_KEY=xxx npx tsx tests/e2e/yellowcard-sandbox.ts
 *   YELLOWCARD_API_KEY=xxx YELLOWCARD_SECRET_KEY=xxx YELLOWCARD_E2E_LIVE_ORDER=1 npx tsx tests/e2e/yellowcard-sandbox.ts
 */

import crypto from 'crypto';

// Vector test data - based on current implementation
// NOTE: This is self-referential. If the implementation is wrong, this test passes anyway.
const VECTOR_SECRET = 'sk_test_FAKE_SECRET';
const VECTOR_METHOD = 'POST';
const VECTOR_PATH = '/v1/quotes/buy';
const VECTOR_TIMESTAMP = '1704067200000'; // 2024-01-01 00:00:00 UTC
const VECTOR_BODY = '{"fiatCurrency":"ZAR","cryptoCurrency":"BTC","fiatAmount":1000}';

// Expected signature: HMAC-SHA256(secret, method+path+timestamp+body) in hex
const VECTOR_EXPECTED_SIG = crypto
  .createHmac('sha256', VECTOR_SECRET)
  .update(`${VECTOR_METHOD}${VECTOR_PATH}${VECTOR_TIMESTAMP}${VECTOR_BODY}`)
  .digest('hex');

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`  ${message}`);
}

// Import YellowCardProvider
const YellowCardProvider = require('../../dist/src/crypto/yellowcard').YellowCardProvider;

async function runTests() {
  console.log('\n=== Yellow Card Sandbox Harness ===\n');
  console.log('⚠️  WARNING: Yellow Card API spec is UNVERIFIED');
  console.log('   No official documentation found. Tests validate internal consistency only.\n');

  // Test 1: Vector test - known input/output
  await (async () => {
    try {
      const provider = new YellowCardProvider({
        apiKey: 'test_api_key',
        secretKey: VECTOR_SECRET,
        sandbox: true,
      });

      const signature = provider['generateSignature'](
        VECTOR_METHOD,
        VECTOR_PATH,
        VECTOR_TIMESTAMP,
        VECTOR_BODY
      );

      if (signature !== VECTOR_EXPECTED_SIG) {
        throw new Error(`Expected ${VECTOR_EXPECTED_SIG}, got ${signature}`);
      }

      results.push({ name: 'Vector test: known input/output', pass: true });
      log('✓ Vector test: known input/output');
    } catch (error: any) {
      results.push({ name: 'Vector test: known input/output', pass: false, error: error.message });
      log(`✗ Vector test: known input/output: ${error.message}`);
    }
  })();

  // Test 2: Spec replication - independently verify signature algorithm
  await (async () => {
    try {
      const secretKey = 'sk_test_spec_verification';
      const method = 'POST';
      const path = '/v1/orders/buy';
      const timestamp = Date.now().toString();
      const body = JSON.stringify({
        cryptoCurrency: 'BTC',
        fiatCurrency: 'ZAR',
        fiatAmount: 5000,
      });

      // Reference implementation - HMAC-SHA256(secret, method+path+timestamp+body) hex
      const message = `${method}${path}${timestamp}${body}`;
      const expectedSig = crypto
        .createHmac('sha256', secretKey)
        .update(message)
        .digest('hex');

      // Our implementation
      const provider = new YellowCardProvider({
        apiKey: 'test_api_key',
        secretKey,
        sandbox: true,
      });

      const actualSig = provider['generateSignature'](method, path, timestamp, body);

      if (actualSig !== expectedSig) {
        throw new Error(`Spec mismatch: expected ${expectedSig}, got ${actualSig}`);
      }

      results.push({ name: 'Spec replication: algorithm matches reference', pass: true });
      log('✓ Spec replication: algorithm matches reference');
    } catch (error: any) {
      results.push({
        name: 'Spec replication: algorithm matches reference',
        pass: false,
        error: error.message,
      });
      log(`✗ Spec replication: algorithm matches reference: ${error.message}`);
    }
  })();

  // Test 3: Signature output encoding is hex
  await (async () => {
    try {
      const provider = new YellowCardProvider({
        apiKey: 'test_api_key',
        secretKey: 'test_secret',
        sandbox: true,
      });

      const signature = provider['generateSignature']('GET', '/v1/orders/123', '1234567890', '');

      // Verify it's valid hex (lowercase a-f, 0-9, 64 chars for SHA256)
      if (!/^[a-f0-9]{64}$/.test(signature)) {
        throw new Error(`Invalid hex signature format: ${signature}`);
      }

      results.push({ name: 'Signature output: valid hex format', pass: true });
      log('✓ Signature output: valid hex format');
    } catch (error: any) {
      results.push({ name: 'Signature output: valid hex format', pass: false, error: error.message });
      log(`✗ Signature output: valid hex format: ${error.message}`);
    }
  })();

  // Test 4: Webhook roundtrip - simple signature (no timestamp)
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
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

      if (!isValid) {
        throw new Error('Valid simple webhook rejected');
      }

      results.push({ name: 'Webhook roundtrip: simple signature valid', pass: true });
      log('✓ Webhook roundtrip: simple signature valid');
    } catch (error: any) {
      results.push({
        name: 'Webhook roundtrip: simple signature valid',
        pass: false,
        error: error.message,
      });
      log(`✗ Webhook roundtrip: simple signature valid: ${error.message}`);
    }
  })();

  // Test 5: Webhook roundtrip - timestamp-based signature
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
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

      if (!isValid) {
        throw new Error('Valid timestamp webhook rejected');
      }

      results.push({ name: 'Webhook roundtrip: timestamp-based signature valid', pass: true });
      log('✓ Webhook roundtrip: timestamp-based signature valid');
    } catch (error: any) {
      results.push({
        name: 'Webhook roundtrip: timestamp-based signature valid',
        pass: false,
        error: error.message,
      });
      log(`✗ Webhook roundtrip: timestamp-based signature valid: ${error.message}`);
    }
  })();

  // Test 6: Webhook - tampered body rejected
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
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

      if (isValid) {
        throw new Error('Tampered webhook accepted');
      }

      results.push({ name: 'Webhook: tampered body rejected', pass: true });
      log('✓ Webhook: tampered body rejected');
    } catch (error: any) {
      results.push({ name: 'Webhook: tampered body rejected', pass: false, error: error.message });
      log(`✗ Webhook: tampered body rejected: ${error.message}`);
    }
  })();

  // Test 7: Webhook - expired timestamp rejected
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
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

      if (isValid) {
        throw new Error('Expired webhook accepted');
      }

      results.push({ name: 'Webhook: expired timestamp rejected', pass: true });
      log('✓ Webhook: expired timestamp rejected');
    } catch (error: any) {
      results.push({ name: 'Webhook: expired timestamp rejected', pass: false, error: error.message });
      log(`✗ Webhook: expired timestamp rejected: ${error.message}`);
    }
  })();

  // Test 8: Webhook - missing secret returns false
  await (async () => {
    try {
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

      if (isValid) {
        throw new Error('Webhook accepted without secret');
      }

      results.push({ name: 'Webhook: missing secret returns false', pass: true });
      log('✓ Webhook: missing secret returns false');
    } catch (error: any) {
      results.push({
        name: 'Webhook: missing secret returns false',
        pass: false,
        error: error.message,
      });
      log(`✗ Webhook: missing secret returns false: ${error.message}`);
    }
  })();

  // Test 9: Webhook - wrong signature rejected
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
      const provider = new YellowCardProvider({
        apiKey: 'test_api_key',
        secretKey: 'test_secret',
        sandbox: true,
        webhookSecret,
      });

      const body = JSON.stringify({ eventType: 'order_completed', orderId: 'yc_123' });
      const headers = {
        'x-yellowcard-signature': 'wrong_signature',
      };

      const isValid = provider.verifyWebhook(body, headers);

      if (isValid) {
        throw new Error('Wrong signature accepted');
      }

      results.push({ name: 'Webhook: wrong signature rejected', pass: true });
      log('✓ Webhook: wrong signature rejected');
    } catch (error: any) {
      results.push({ name: 'Webhook: wrong signature rejected', pass: false, error: error.message });
      log(`✗ Webhook: wrong signature rejected: ${error.message}`);
    }
  })();

  // Live sandbox tests (optional)
  const apiKey = process.env.YELLOWCARD_API_KEY;
  const secretKey = process.env.YELLOWCARD_SECRET_KEY;

  if (apiKey && secretKey) {
    console.log('\n--- Live Sandbox Tests ---\n');
    console.log('⚠️  WARNING: These tests will likely FAIL due to unverified API spec\n');

    // Test 10: Live capabilities check
    await (async () => {
      try {
        const provider = new YellowCardProvider({
          apiKey,
          secretKey,
          sandbox: true,
        });

        const capabilities = provider.getCapabilities();

        log(`✓ Capabilities: ${capabilities.supportedAssets.join(', ')}`);
        log(`  Fiat: ${capabilities.supportedFiat.join(', ')}`);

        results.push({ name: 'Live sandbox: capabilities', pass: true });
      } catch (error: any) {
        results.push({ name: 'Live sandbox: capabilities', pass: false, error: error.message });
        log(`✗ Live sandbox: capabilities: ${error.message}`);
      }
    })();

    // Test 11: Live quote (will likely fail if endpoints/headers are wrong)
    await (async () => {
      try {
        const provider = new YellowCardProvider({
          apiKey,
          secretKey,
          sandbox: true,
        });

        log('  Attempting quote request (expect failure if API spec is wrong)...');
        const quote = await provider.getQuote('on', 1000, 'ZAR', 'BTC', 'BTC');

        log(`✓ Live quote: ${quote.cryptoAmount} BTC for ${quote.fiatAmount} ZAR`);
        log(`  Rate: ${quote.rate.toFixed(2)}, Fee: ${quote.feePercent.toFixed(2)}%`);

        results.push({ name: 'Live sandbox: quote API', pass: true });
      } catch (error: any) {
        results.push({ name: 'Live sandbox: quote API', pass: false, error: error.message });
        log(`✗ Live sandbox: quote API: ${error.message}`);
        log(`  This is EXPECTED if API spec is incorrect`);
      }
    })();

    // Test 12: Live order creation (only if explicitly enabled)
    if (process.env.YELLOWCARD_E2E_LIVE_ORDER === '1') {
      await (async () => {
        try {
          const provider = new YellowCardProvider({
            apiKey,
            secretKey,
            sandbox: true,
          });

          log('  Creating live test order...');
          const result = await provider.createOnRamp({
            fiatAmount: 100,
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
            reference: 'YC-E2E-TEST-001',
          });

          log(`✓ Live order created: ${result.id}`);
          log(`  Status: ${result.status}`);
          if (result.checkoutUrl) {
            log(`  URL: ${result.checkoutUrl}`);
          }

          results.push({ name: 'Live sandbox: order creation', pass: true });
        } catch (error: any) {
          results.push({ name: 'Live sandbox: order creation', pass: false, error: error.message });
          log(`✗ Live sandbox: order creation: ${error.message}`);
        }
      })();
    } else {
      log('⊘ Live order creation skipped (set YELLOWCARD_E2E_LIVE_ORDER=1 to enable)');
    }
  } else {
    log('\n⊘ Live sandbox tests skipped (YELLOWCARD_API_KEY not set)\n');
  }

  // Print summary
  console.log('\n=== Summary ===\n');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  results.forEach((r) => {
    const icon = r.pass ? '[PASS]' : '[FAIL]';
    console.log(`${icon} ${r.name}`);
    if (r.error) {
      console.log(`       ${r.error}`);
    }
  });

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Harness error:', error);
  process.exit(1);
});
