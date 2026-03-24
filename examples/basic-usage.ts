/**
 * PayBridge — Basic usage examples
 */

import { PayBridge } from '../src';
import type { WebhookEvent } from '../src/types';

// ==================== Setup ====================

// Initialize PayBridge with SoftyComp
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY || '',
    secretKey: process.env.SOFTYCOMP_SECRET_KEY || '',
  },
  sandbox: true,
  webhookSecret: process.env.WEBHOOK_SECRET,
});

// ==================== One-time Payment ====================

async function createOneTimePayment() {
  const payment = await pay.createPayment({
    amount: 299.0,
    currency: 'ZAR',
    reference: `INV-${Date.now()}`,
    description: 'Monthly subscription',
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
    metadata: {
      orderId: '12345',
      planType: 'pro',
    },
  });

  console.log('Payment created:', {
    id: payment.id,
    checkoutUrl: payment.checkoutUrl,
    status: payment.status,
    provider: payment.provider,
  });

  // Redirect customer to payment.checkoutUrl
  return payment;
}

// ==================== Recurring Subscription ====================

async function createMonthlySubscription() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const subscription = await pay.createSubscription({
    amount: 299.0,
    currency: 'ZAR',
    interval: 'monthly',
    reference: `SUB-${Date.now()}`,
    description: 'Pro Plan - Monthly',
    customer: {
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '0835551234',
    },
    urls: {
      success: 'https://myapp.com/subscription/success',
      cancel: 'https://myapp.com/subscription/cancel',
      webhook: 'https://myapp.com/webhook',
    },
    startDate: tomorrow.toISOString().split('T')[0],
    billingDay: 1,
    metadata: {
      userId: '67890',
      planType: 'pro',
    },
  });

  console.log('Subscription created:', {
    id: subscription.id,
    checkoutUrl: subscription.checkoutUrl,
    status: subscription.status,
    interval: subscription.interval,
  });

  return subscription;
}

// ==================== Check Payment Status ====================

async function checkPaymentStatus(paymentId: string) {
  const payment = await pay.getPayment(paymentId);

  console.log('Payment status:', {
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
  });

  if (payment.status === 'completed') {
    console.log('Payment completed! Fulfill order.');
  } else if (payment.status === 'failed') {
    console.log('Payment failed. Notify customer.');
  }

  return payment;
}

// ==================== Process Refund ====================

async function processFullRefund(paymentId: string) {
  const refund = await pay.refund({
    paymentId,
    reason: 'Customer request',
  });

  console.log('Refund processed:', {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
  });

  return refund;
}

async function processPartialRefund(paymentId: string) {
  const refund = await pay.refund({
    paymentId,
    amount: 100.0, // Refund R100 of R299 payment
    reason: 'Partial refund - item out of stock',
  });

  console.log('Partial refund processed:', {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
  });

  return refund;
}

// ==================== Webhook Handler ====================

function handleWebhook(body: any, headers: any) {
  // 1. Verify signature
  const isValid = pay.verifyWebhook(body, headers);
  if (!isValid) {
    console.error('Invalid webhook signature!');
    return { success: false, error: 'Invalid signature' };
  }

  // 2. Parse webhook event
  const event: WebhookEvent = pay.parseWebhook(body, headers);

  // 3. Handle event
  switch (event.type) {
    case 'payment.pending':
      console.log('Payment pending:', event.payment);
      // Update database: payment status = pending
      break;

    case 'payment.completed':
      console.log('Payment completed:', event.payment);
      // Update database: payment status = completed
      // Fulfill order, activate subscription, etc.
      break;

    case 'payment.failed':
      console.log('Payment failed:', event.payment);
      // Update database: payment status = failed
      // Send notification to customer
      break;

    case 'payment.cancelled':
      console.log('Payment cancelled:', event.payment);
      // Update database: payment status = cancelled
      break;

    case 'refund.completed':
      console.log('Refund completed:', event.refund);
      // Update database: refund status = completed
      // Send refund confirmation email
      break;

    case 'subscription.created':
      console.log('Subscription created:', event.subscription);
      break;

    case 'subscription.cancelled':
      console.log('Subscription cancelled:', event.subscription);
      break;

    default:
      console.warn('Unknown event type:', event.type);
  }

  return { success: true, event };
}

// ==================== Express.js Integration ====================

/*
import express from 'express';

const app = express();

// Webhook endpoint
// IMPORTANT: Use express.raw() for signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const result = handleWebhook(req.body, req.headers);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.status(200).json({ success: true });
});

// Create payment endpoint
app.post('/payments', express.json(), async (req, res) => {
  try {
    const payment = await createOneTimePayment();
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check payment status endpoint
app.get('/payments/:id', async (req, res) => {
  try {
    const payment = await checkPaymentStatus(req.params.id);
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
*/

// ==================== Provider Switching ====================

async function switchProvidersExample() {
  // Using SoftyComp
  const paySofty = new PayBridge({
    provider: 'softycomp',
    credentials: {
      apiKey: 'softy_key',
      secretKey: 'softy_secret',
    },
    sandbox: true,
  });

  // Using Yoco (when implemented)
  const payYoco = new PayBridge({
    provider: 'yoco',
    credentials: {
      apiKey: 'sk_test_...',
    },
    sandbox: true,
  });

  // Same API for both!
  const paymentParams = {
    amount: 299.0,
    currency: 'ZAR' as const,
    reference: 'INV-001',
    customer: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    urls: {
      success: 'https://myapp.com/success',
      cancel: 'https://myapp.com/cancel',
      webhook: 'https://myapp.com/webhook',
    },
  };

  // Works with SoftyComp
  const payment1 = await paySofty.createPayment(paymentParams);
  console.log('SoftyComp payment:', payment1.provider);

  // Works with Yoco (same code!)
  // const payment2 = await payYoco.createPayment(paymentParams);
  // console.log('Yoco payment:', payment2.provider);
}

// ==================== Run Examples ====================

async function main() {
  try {
    // Create one-time payment
    // await createOneTimePayment();

    // Create monthly subscription
    // await createMonthlySubscription();

    // Check payment status
    // await checkPaymentStatus('BILL-REF-123');

    // Process refund
    // await processFullRefund('BILL-REF-123');

    // Provider switching example
    // await switchProvidersExample();

    console.log('PayBridge examples ready! Uncomment functions to test.');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Uncomment to run
// main();
