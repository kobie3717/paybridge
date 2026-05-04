# Multi-Provider Routing

PayBridgeRouter enables smart routing across multiple payment providers with automatic failover.

## Why routing?

- **Cost optimization**: Pick the cheapest provider for each transaction
- **Reliability**: Automatic failover when a provider is down
- **Performance**: Route to the fastest provider
- **Load distribution**: Round-robin across providers

## Quick start

```typescript
import { PayBridge, PayBridgeRouter } from 'paybridge';

const softycomp = new PayBridge({ provider: 'softycomp', credentials: {...}, sandbox: true });
const yoco = new PayBridge({ provider: 'yoco', credentials: {...}, sandbox: true });
const stripe = new PayBridge({ provider: 'stripe', credentials: {...}, sandbox: true });

const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },
    { provider: yoco, weight: 2 },
    { provider: stripe, weight: 3 }
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

## Routing metadata

Every routed request returns `routingMeta`:

```typescript
{
  chosenProvider: 'stripe',
  attempts: [
    {
      provider: 'softycomp',
      success: false,
      errorCode: 'TIMEOUT',
      durationMs: 30001
    },
    {
      provider: 'stripe',
      success: true,
      durationMs: 245
    }
  ],
  totalDurationMs: 30246
}
```

## Features

- **4 routing strategies**: cheapest, fastest, priority, round-robin
- **Circuit breaker**: Trips after 5 failures, reopens after 30s
- **429-aware**: Rate limits don't trip the circuit
- **Automatic failover**: Tries next provider on failure
- **Redis support**: Share circuit breaker state across instances

## Webhooks with routing

When using a router, specify the provider name to prevent confused-deputy attacks:

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

## Next steps

- [Learn about routing strategies](/routing/strategies)
- [Configure circuit breaker](/routing/circuit-breaker)
- [Set up crypto routing](/routing/crypto-router)
