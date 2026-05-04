# Webhook Idempotency

Providers retry webhook delivery on non-2xx responses. Without idempotency protection, your handler may process the same event multiple times.

## The problem

Scenario without idempotency:

1. Provider sends webhook → your handler processes event → sends email
2. Your server returns 500 (database hiccup)
3. Provider retries webhook → **your handler processes again → sends duplicate email**

## The solution

PayBridge 0.3.0+ includes optional idempotency stores to deduplicate webhooks by event ID.

## In-memory store (single instance)

```typescript
import { PayBridgeRouter, InMemoryIdempotencyStore } from 'paybridge';

const router = new PayBridgeRouter({
  providers: [...],
  idempotencyStore: new InMemoryIdempotencyStore({
    cleanupIntervalMs: 60000  // Clean up expired entries every 60s
  })
});
```

## Redis store (multi-instance)

Recommended for deployments behind a load balancer:

```typescript
import Redis from 'ioredis';
import { createRedisIdempotencyStore } from 'paybridge';

const redis = new Redis(process.env.REDIS_URL);
const store = createRedisIdempotencyStore({
  redis,
  keyPrefix: 'app:idem:',
  ttlSeconds: 86400  // 24h default
});

const router = new PayBridgeRouter({
  providers: [...],
  idempotencyStore: store
});
```

Works with both `ioredis` and `redis` (node-redis v4+).

## Handling duplicates

When enabled, `parseWebhook` throws `WebhookDuplicateError` on duplicates:

```typescript
import { WebhookDuplicateError } from 'paybridge';

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const event = await router.parseWebhook(req.body, req.headers, 'stripe');
    
    // Process event (first time only)
    await fulfillOrder(event.payment.id);
    
    res.sendStatus(200);
  } catch (error) {
    if (error instanceof WebhookDuplicateError) {
      // Already processed — return 200 OK to stop retries
      console.log('Duplicate webhook, skipping');
      return res.sendStatus(200);
    }
    throw error;
  }
});
```

## TTL (Time-to-Live)

Default: 24 hours. After TTL expires, the event ID is forgotten and can be processed again.

Custom TTL:

```typescript
const store = new InMemoryIdempotencyStore({ ttlSeconds: 7200 }); // 2 hours
```

## Event ID extraction

PayBridge extracts event IDs from provider-specific fields:

| Provider | Event ID field |
|----------|----------------|
| Stripe | `event.id` |
| PayStack | `event.id` |
| Yoco | `event.id` |
| Others | Provider-specific |

## Breaking change (0.2 → 0.3)

`PayBridgeRouter.parseWebhook` is now **async** (returns `Promise<WebhookEvent>`):

```typescript
// Before (0.2.x)
const event = router.parseWebhook(req.body, req.headers, 'stripe');

// After (0.3.x)
const event = await router.parseWebhook(req.body, req.headers, 'stripe');
```

See [Migration Guide](/migration) for details.

## Next steps

- [Migration guide (0.2 → 0.3)](/migration)
- [Replay protection](/webhooks/replay-protection)
