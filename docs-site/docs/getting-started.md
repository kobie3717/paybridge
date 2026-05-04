# Getting Started

## Installation

```bash
npm install paybridge
```

## Single-provider quick start

```typescript
import { PayBridge } from 'paybridge';

// Initialize with your provider
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY,
    secretKey: process.env.SOFTYCOMP_SECRET_KEY
  },
  sandbox: true
});

// Create payment — same API regardless of provider
const payment = await pay.createPayment({
  amount: 299.00,        // Always in major currency unit (rands, dollars)
  currency: 'ZAR',
  reference: 'INV-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0825551234'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

// Redirect customer to payment page
console.log(payment.checkoutUrl);
console.log(payment.id);       // Provider payment ID
console.log(payment.status);   // 'pending' | 'completed' | 'failed' | 'cancelled'
```

## Multi-provider routing

Use `PayBridgeRouter` to automatically route requests across multiple providers:

```typescript
import { PayBridge, PayBridgeRouter } from 'paybridge';

const softycomp = new PayBridge({ provider: 'softycomp', credentials: {...}, sandbox: true });
const yoco = new PayBridge({ provider: 'yoco', credentials: {...}, sandbox: true });

const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },
    { provider: yoco, weight: 2 }
  ],
  strategy: 'cheapest',
  fallback: {
    enabled: true,
    maxAttempts: 3,
    retryDelayMs: 250
  }
});

const payment = await router.createPayment({
  amount: 299.00,
  currency: 'ZAR',
  reference: 'INV-001',
  customer: { name: 'John Doe', email: 'john@example.com' },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

console.log(payment.routingMeta.chosenProvider);
console.log(payment.routingMeta.attempts);
```

## Webhook handler

```typescript
import express from 'express';

const app = express();

// IMPORTANT: Use express.raw() for signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Verify webhook signature
  if (!pay.verifyWebhook(req.body, req.headers)) {
    return res.status(400).send('Invalid signature');
  }

  // Parse webhook event
  const event = pay.parseWebhook(req.body, req.headers);

  switch (event.type) {
    case 'payment.completed':
      console.log('Payment completed:', event.payment);
      // Fulfill order, activate subscription, etc.
      break;

    case 'payment.failed':
      console.log('Payment failed:', event.payment);
      break;

    case 'payment.cancelled':
      console.log('Payment cancelled:', event.payment);
      break;

    case 'refund.completed':
      console.log('Refund completed:', event.refund);
      break;
  }

  res.sendStatus(200);
});
```

## Next steps

- [Explore all 14 fiat providers](/providers/overview)
- [Learn about routing strategies](/routing/strategies)
- [Set up webhook idempotency](/webhooks/idempotency)
- [Add crypto on/off-ramp](/crypto/overview)
- [Check out framework examples](/examples)
