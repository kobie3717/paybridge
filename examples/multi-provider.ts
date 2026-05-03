/**
 * Multi-provider routing example
 * Demonstrates PayBridgeRouter with 4 SA providers, cheapest strategy, and idempotency store
 */

import { PayBridge, PayBridgeRouter, InMemoryIdempotencyStore, WebhookDuplicateError } from '../src/index';

const softycomp = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY ?? 'dummy_api_key',
    secretKey: process.env.SOFTYCOMP_SECRET_KEY ?? 'dummy_secret_key',
  },
  sandbox: true,
  webhookSecret: 'whsec_softycomp_dummy',
});

const yoco = new PayBridge({
  provider: 'yoco',
  credentials: {
    apiKey: process.env.YOCO_API_KEY ?? 'sk_test_dummy_yoco_key',
  },
  sandbox: true,
  webhookSecret: 'whsec_yoco_dummy',
});

const payfast = new PayBridge({
  provider: 'payfast',
  credentials: {
    merchantId: process.env.PAYFAST_MERCHANT_ID ?? '10000100',
    merchantKey: process.env.PAYFAST_MERCHANT_KEY ?? 'dummy_merchant_key',
    passphrase: process.env.PAYFAST_PASSPHRASE ?? 'dummy_passphrase',
  },
  sandbox: true,
});

const paystack = new PayBridge({
  provider: 'paystack',
  credentials: {
    apiKey: process.env.PAYSTACK_API_KEY ?? 'sk_test_dummy_paystack_key',
  },
  sandbox: true,
  webhookSecret: 'whsec_paystack_dummy',
});

const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },
    { provider: yoco, weight: 1 },
    { provider: payfast, weight: 1 },
    { provider: paystack, weight: 1 },
  ],
  strategy: 'cheapest',
  idempotencyStore: new InMemoryIdempotencyStore({ cleanupIntervalMs: 60000 }),
  fallback: {
    enabled: true,
    maxAttempts: 3,
    retryDelayMs: 250,
  },
});

async function createPaymentExample() {
  console.log('=== Creating Payment ===\n');

  const payment = await router.createPayment({
    amount: 299.0,
    currency: 'ZAR',
    reference: 'INV-001',
    customer: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '0825551234',
    },
    urls: {
      success: 'https://myapp.com/success',
      cancel: 'https://myapp.com/cancel',
      webhook: 'https://myapp.com/webhook',
    },
  });

  console.log('Payment created:');
  console.log('  ID:', payment.id);
  console.log('  Status:', payment.status);
  console.log('  Checkout URL:', payment.checkoutUrl);
  console.log('  Provider:', payment.provider);
  console.log('\nRouting metadata:');
  console.log('  Chosen provider:', payment.routingMeta?.chosenProvider);
  console.log('  Strategy:', payment.routingMeta?.strategy);
  console.log('  Attempts:', payment.routingMeta?.attempts.length);
  console.log('\n');
}

async function webhookExample() {
  console.log('=== Webhook Parsing with Idempotency ===\n');

  const mockWebhookBody = JSON.stringify({
    type: 'payment.completed',
    payment_id: 'pay_123',
    amount: 299.0,
    status: 'completed',
  });

  const mockHeaders = {
    'x-webhook-signature': 'mock_signature_abc123',
  };

  try {
    console.log('First webhook delivery (same event):');
    const event1 = await router.parseWebhook(mockWebhookBody, mockHeaders, 'softycomp');
    console.log('  Event type:', event1.type);
    console.log('  Payment ID:', event1.payment?.id);
    console.log('  ✓ Processed successfully\n');
  } catch (error: any) {
    console.log('  Error:', error.message);
  }

  try {
    console.log('Second webhook delivery (duplicate):');
    await router.parseWebhook(mockWebhookBody, mockHeaders, 'softycomp');
    console.log('  ✗ Should have thrown WebhookDuplicateError\n');
  } catch (error: any) {
    if (error instanceof WebhookDuplicateError) {
      console.log('  ✓ Caught WebhookDuplicateError');
      console.log('    Provider:', error.provider);
      console.log('    Event ID:', error.eventId);
      console.log('    → Return 200 OK to stop retries\n');
    } else {
      console.log('  Unexpected error:', error.message);
    }
  }
}

async function main() {
  console.log('PayBridge Multi-Provider Routing Example\n');
  console.log('==========================================\n');

  console.log('Expected output (with dummy credentials):\n');
  console.log('- createPayment: would attempt to create payment via cheapest provider');
  console.log('- parseWebhook: demonstrates idempotency deduplication\n');
  console.log('------------------------------------------\n');

  await webhookExample();
}

main().catch(console.error);
