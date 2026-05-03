# Migration Guide

This guide helps you upgrade PayBridge between major and minor versions.

## 0.2 → 0.3

### Breaking Changes

#### `PayBridgeRouter.parseWebhook` is now async

`PayBridgeRouter.parseWebhook` returns `Promise<WebhookEvent>` (was `WebhookEvent`). This change supports the new optional idempotency store, which performs an async dedup check.

> Note: `PayBridge.parseWebhook` (single-provider class) is **unchanged** — still synchronous. Only callers using the multi-provider router need to update.

**Before (0.2.x):**

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }
  const event = router.parseWebhook(req.body, req.headers, 'stripe');
  // ...
});
```

**After (0.3.x):**

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }
  const event = await router.parseWebhook(req.body, req.headers, 'stripe');
  // ...
});
```

If you do not configure an `idempotencyStore`, behavior is otherwise identical. Sync-style callers will still execute correctly but receive a `Promise` — TypeScript will catch this at compile time.

### New Features (Optional)

#### Webhook Idempotency Store

Webhook providers retry delivery on non-2xx responses. Without idempotency protection, your handler may process the same event multiple times, causing duplicate refunds, fulfillments, or emails.

PayBridge 0.3.0 adds optional idempotency stores to prevent this:

```typescript
import { PayBridgeRouter, InMemoryIdempotencyStore } from 'paybridge';

const router = new PayBridgeRouter({
  providers: [...],
  idempotencyStore: new InMemoryIdempotencyStore({ cleanupIntervalMs: 60000 })
});
```

When configured, `parseWebhook` automatically deduplicates events by ID. If a duplicate is detected, it throws `WebhookDuplicateError`:

```typescript
try {
  const event = await router.parseWebhook(req.body, req.headers, 'stripe');
  // Process event
} catch (error) {
  if (error instanceof WebhookDuplicateError) {
    // Already processed — respond 200 OK to stop retries
    return res.sendStatus(200);
  }
  throw error;
}
```

**Redis-backed store** (recommended for multi-instance deployments):

```typescript
import Redis from 'ioredis';
import { createRedisIdempotencyStore } from 'paybridge';

const redis = new Redis(process.env.REDIS_URL);
const store = createRedisIdempotencyStore({ redis, keyPrefix: 'app:idem:' });

const router = new PayBridgeRouter({
  providers: [...],
  idempotencyStore: store
});
```

Default TTL is 24 hours. Idempotency is **opt-in** — if you don't configure a store, behavior is unchanged.

#### Crypto Router `fastest` Strategy

`CryptoRampRouter` now supports `'fastest'` strategy (sorts providers by `avgLatencyMs`):

```typescript
import { CryptoRampRouter } from 'paybridge/crypto';

const router = new CryptoRampRouter({
  providers: [...],
  strategy: 'fastest'  // NEW: picks lowest latency provider
});
```

Previously only `'cheapest'`, `'priority'`, and `'round-robin'` were available.

### Experimental Features

Yellow Card crypto provider remains `@experimental` (requires partner API spec verification).

## 0.1 → 0.2

### Breaking Changes

#### 1. Webhook Methods Require `providerName` Argument

**Reasoning:** Prevents confused-deputy attacks where a webhook crafted to pass one provider's signature verification triggers another provider's handler.

**Before (0.1.x):**

```typescript
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers)) {
    return res.status(401).send('Unauthorized');
  }
  const event = router.parseWebhook(req.body, req.headers);
  // ...
});
```

**After (0.2.x):**

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }
  const event = router.parseWebhook(req.body, req.headers, 'stripe');
  // ...
});
```

Use separate webhook endpoints per provider, or extract provider from URL/headers.

#### 2. Providers Must Implement `getCapabilities()`

All built-in providers now return capability metadata (fees, currencies, latency). If you have custom providers extending `PaymentProvider`, you must implement this method:

**Before (0.1.x):**

```typescript
class MyProvider extends PaymentProvider {
  // getCapabilities() not required
}
```

**After (0.2.x):**

```typescript
import { ProviderCapabilities } from 'paybridge';

class MyProvider extends PaymentProvider {
  getCapabilities(): ProviderCapabilities {
    return {
      currencies: ['USD', 'EUR'],
      fees: { fixed: 0.30, percent: 2.9 },
      supportsRefunds: true,
      supportsSubscriptions: true,
      // optional: avgLatencyMs, minAmount, maxAmount, country
    };
  }
}
```

### New Features

See [CHANGELOG.md](../CHANGELOG.md#020---2026-05-03) for the full list:

- Multi-provider routing with circuit breakers
- 8 fiat providers (Stripe, PayFast, PayStack, Yoco, Ozow, Peach, Flutterwave, SoftyComp)
- 2 crypto on/off-ramp providers (MoonPay, Yellow Card experimental)
- Webhook signature verification with timestamp replay protection
- Routing strategies: cheapest, fastest, priority, round-robin
- E2E sandbox harnesses + 227 unit tests

## Need Help?

- **Discord:** [https://discord.gg/Y2jCXNGgE](https://discord.gg/Y2jCXNGgE)
- **Issues:** [GitHub Issues](https://github.com/kobie3717/paybridge/issues)
- **Full changelog:** [CHANGELOG.md](../CHANGELOG.md)
