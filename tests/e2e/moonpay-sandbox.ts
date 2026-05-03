/**
 * MoonPay E2E Sandbox Harness
 *
 * Runs vector tests, spec replication, webhook roundtrip, and optional live sandbox calls.
 *
 * Usage:
 *   npx tsx tests/e2e/moonpay-sandbox.ts
 *   MOONPAY_API_KEY=pk_test_xxx npx tsx tests/e2e/moonpay-sandbox.ts
 */

import crypto from 'crypto';

// Vector test data
const VECTOR_SECRET = 'sk_test_FAKE';
const VECTOR_QUERY = 'apiKey=pk_test_123&currencyCode=btc&baseCurrencyAmount=100';
const VECTOR_EXPECTED_SIG = crypto
  .createHmac('sha256', VECTOR_SECRET)
  .update(`?${VECTOR_QUERY}`)
  .digest('base64');

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`  ${message}`);
}

function test(name: string, fn: () => void | Promise<void>): void {
  (async () => {
    try {
      await fn();
      results.push({ name, pass: true });
      log(`✓ ${name}`);
    } catch (error: any) {
      results.push({ name, pass: false, error: error.message });
      log(`✗ ${name}: ${error.message}`);
    }
  })();
}

// Import MoonPayProvider
const MoonPayProvider = require('../../dist/src/crypto/moonpay').MoonPayProvider;

async function runTests() {
  console.log('\n=== MoonPay Sandbox Harness ===\n');

  // Test 1: Vector test
  await (async () => {
    try {
      const provider = new MoonPayProvider({
        apiKey: 'pk_test_123',
        secretKey: VECTOR_SECRET,
        sandbox: true,
      });

      const signature = provider['signWidgetUrl'](`?${VECTOR_QUERY}`);

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

  // Test 2: Spec replication test
  await (async () => {
    try {
      const secretKey = 'sk_test_spec_verification';
      const queryParams = new URLSearchParams({
        apiKey: 'pk_test_abc',
        currencyCode: 'eth',
        baseCurrencyAmount: '500',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      });

      // Reference implementation from MoonPay spec
      const qs = `?${queryParams.toString()}`;
      const expectedSig = crypto
        .createHmac('sha256', secretKey)
        .update(qs)
        .digest('base64');

      // Our implementation
      const provider = new MoonPayProvider({
        apiKey: 'pk_test_abc',
        secretKey,
        sandbox: true,
      });

      const actualSig = provider['signWidgetUrl'](qs);

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

  // Test 3: Webhook V2 roundtrip - valid
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
      const provider = new MoonPayProvider({
        apiKey: 'pk_test_123',
        secretKey: 'sk_test_123',
        sandbox: true,
        webhookSecret,
      });

      const body = JSON.stringify({ type: 'transaction_completed', data: { id: 'tx_456' } });
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

      if (!isValid) {
        throw new Error('Valid V2 webhook rejected');
      }

      results.push({ name: 'Webhook V2 roundtrip: valid signature', pass: true });
      log('✓ Webhook V2 roundtrip: valid signature');
    } catch (error: any) {
      results.push({
        name: 'Webhook V2 roundtrip: valid signature',
        pass: false,
        error: error.message,
      });
      log(`✗ Webhook V2 roundtrip: valid signature: ${error.message}`);
    }
  })();

  // Test 4: Webhook V2 - tampered body
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
      const provider = new MoonPayProvider({
        apiKey: 'pk_test_123',
        secretKey: 'sk_test_123',
        sandbox: true,
        webhookSecret,
      });

      const body = JSON.stringify({ type: 'transaction_completed', data: { id: 'tx_456' } });
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = `${timestamp}.${body}`;
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const tamperedBody = JSON.stringify({ type: 'transaction_completed', data: { id: 'tx_999' } });
      const headers = {
        'moonpay-signature-v2': `t=${timestamp},s=${signature}`,
      };

      const isValid = provider.verifyWebhook(tamperedBody, headers);

      if (isValid) {
        throw new Error('Tampered V2 webhook accepted');
      }

      results.push({ name: 'Webhook V2: tampered body rejected', pass: true });
      log('✓ Webhook V2: tampered body rejected');
    } catch (error: any) {
      results.push({ name: 'Webhook V2: tampered body rejected', pass: false, error: error.message });
      log(`✗ Webhook V2: tampered body rejected: ${error.message}`);
    }
  })();

  // Test 5: Webhook V2 - expired timestamp
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
      const provider = new MoonPayProvider({
        apiKey: 'pk_test_123',
        secretKey: 'sk_test_123',
        sandbox: true,
        webhookSecret,
      });

      const body = JSON.stringify({ type: 'transaction_completed', data: { id: 'tx_456' } });
      const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
      const payload = `${timestamp}.${body}`;
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const headers = {
        'moonpay-signature-v2': `t=${timestamp},s=${signature}`,
      };

      const isValid = provider.verifyWebhook(body, headers);

      if (isValid) {
        throw new Error('Expired V2 webhook accepted');
      }

      results.push({ name: 'Webhook V2: expired timestamp rejected', pass: true });
      log('✓ Webhook V2: expired timestamp rejected');
    } catch (error: any) {
      results.push({
        name: 'Webhook V2: expired timestamp rejected',
        pass: false,
        error: error.message,
      });
      log(`✗ Webhook V2: expired timestamp rejected: ${error.message}`);
    }
  })();

  // Test 6: Webhook V2 - wrong signature
  await (async () => {
    try {
      const webhookSecret = 'webhook_secret_123';
      const provider = new MoonPayProvider({
        apiKey: 'pk_test_123',
        secretKey: 'sk_test_123',
        sandbox: true,
        webhookSecret,
      });

      const body = JSON.stringify({ type: 'transaction_completed', data: { id: 'tx_456' } });
      const timestamp = Math.floor(Date.now() / 1000);

      const headers = {
        'moonpay-signature-v2': `t=${timestamp},s=wrongsignature`,
      };

      const isValid = provider.verifyWebhook(body, headers);

      if (isValid) {
        throw new Error('Wrong V2 signature accepted');
      }

      results.push({ name: 'Webhook V2: wrong signature rejected', pass: true });
      log('✓ Webhook V2: wrong signature rejected');
    } catch (error: any) {
      results.push({
        name: 'Webhook V2: wrong signature rejected',
        pass: false,
        error: error.message,
      });
      log(`✗ Webhook V2: wrong signature rejected: ${error.message}`);
    }
  })();

  // Live sandbox tests (optional)
  const apiKey = process.env.MOONPAY_API_KEY;
  const secretKey = process.env.MOONPAY_SECRET_KEY;

  if (apiKey && secretKey) {
    console.log('\n--- Live Sandbox Tests ---\n');

    // Test 7: Live quote
    await (async () => {
      try {
        const provider = new MoonPayProvider({
          apiKey,
          secretKey,
          sandbox: true,
        });

        const quote = await provider.getQuote('on', 100, 'USD', 'BTC', 'BTC');

        log(`✓ Live quote: ${quote.cryptoAmount} BTC for $${quote.fiatAmount} USD`);
        log(`  Rate: $${quote.rate.toFixed(2)}, Fee: ${quote.feePercent.toFixed(2)}%`);

        results.push({ name: 'Live sandbox: quote API', pass: true });
      } catch (error: any) {
        results.push({ name: 'Live sandbox: quote API', pass: false, error: error.message });
        log(`✗ Live sandbox: quote API: ${error.message}`);
      }
    })();

    // Test 8: Widget URL generation
    await (async () => {
      try {
        const provider = new MoonPayProvider({
          apiKey,
          secretKey,
          sandbox: true,
        });

        const result = await provider.createOnRamp({
          fiatAmount: 50,
          fiatCurrency: 'USD',
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
          reference: 'E2E-TEST-001',
        });

        log(`✓ Widget URL generated: ${result.checkoutUrl}`);
        log(`  \n  Open this URL in a browser to verify MoonPay accepts the signature:`);
        log(`  ${result.checkoutUrl}\n`);

        results.push({ name: 'Live sandbox: widget URL generation', pass: true });
      } catch (error: any) {
        results.push({
          name: 'Live sandbox: widget URL generation',
          pass: false,
          error: error.message,
        });
        log(`✗ Live sandbox: widget URL generation: ${error.message}`);
      }
    })();
  } else {
    log('\n⊘ Live sandbox tests skipped (MOONPAY_API_KEY not set)\n');
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
