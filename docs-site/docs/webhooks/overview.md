# Webhooks

Webhooks notify your application when payment events occur (completed, failed, refunded).

## Why webhooks?

Payment providers use webhooks to notify you of async events:

- Customer completes payment after redirect
- Recurring subscription charges
- Refund processed
- Payment fails

## Basic webhook handler

```typescript
import express from 'express';

const app = express();

// IMPORTANT: Use express.raw() for signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // 1. Verify signature
  if (!pay.verifyWebhook(req.body, req.headers)) {
    return res.status(401).send('Unauthorized');
  }

  // 2. Parse event
  const event = pay.parseWebhook(req.body, req.headers);

  // 3. Handle event
  switch (event.type) {
    case 'payment.completed':
      console.log('Payment completed:', event.payment);
      // Fulfill order, send receipt, etc.
      break;

    case 'payment.failed':
      console.log('Payment failed:', event.payment);
      // Notify customer
      break;

    case 'refund.completed':
      console.log('Refund completed:', event.refund);
      // Update accounting
      break;
  }

  // 4. Always return 200 OK
  res.sendStatus(200);
});
```

## Event types

PayBridge normalizes webhook events into a discriminated union:

```typescript
type WebhookEvent =
  | { type: 'payment.completed'; payment: PaymentResult }
  | { type: 'payment.failed'; payment: PaymentResult }
  | { type: 'payment.cancelled'; payment: PaymentResult }
  | { type: 'refund.completed'; refund: RefundResult };
```

## Why raw body?

Webhook signature verification requires the **raw request body** (Buffer), not parsed JSON.

**Correct** (Express):

```typescript
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // req.body is a Buffer
  if (!pay.verifyWebhook(req.body, req.headers)) { ... }
});
```

**Wrong**:

```typescript
app.post('/webhook', express.json(), (req, res) => {
  // req.body is already parsed — signature verification will fail
});
```

See [framework examples](/examples) for Fastify, Next.js, and Hono patterns.

## Multi-provider webhooks

When using `PayBridgeRouter`, specify the provider name:

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }

  const event = await router.parseWebhook(req.body, req.headers, 'stripe');
  // Process event...
  res.sendStatus(200);
});
```

This prevents confused-deputy attacks (webhook crafted for one provider triggering another's handler).

## Best practices

1. **Always verify signatures** in production
2. **Always return 200 OK** (even for duplicates) to stop retries
3. **Use raw body** for signature verification
4. **Handle duplicates** with idempotency store
5. **Be idempotent** (process each event only once)
6. **Log failures** but return 200 OK to prevent retry storms

## Next steps

- [Signature verification](/webhooks/signature-verification)
- [Idempotency store](/webhooks/idempotency)
- [Replay protection](/webhooks/replay-protection)
