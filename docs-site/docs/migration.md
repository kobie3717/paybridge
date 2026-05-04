# Migration Guide

This guide helps you upgrade PayBridge between major and minor versions.

## 0.2 → 0.3

### Breaking Changes

#### `PayBridgeRouter.parseWebhook` is now async

`PayBridgeRouter.parseWebhook` returns `Promise<WebhookEvent>` (was `WebhookEvent`). This change supports the new optional idempotency store, which performs an async dedup check.

> Note: `PayBridge.parseWebhook` (single-provider class) is **unchanged** — still synchronous. Only callers using the multi-provider router need to update.

**Before (0.2.x)**:

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }
  const event = router.parseWebhook(req.body, req.headers, 'stripe');
  // ...
});
```

**After (0.3.x)**:

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!router.verifyWebhook(req.body, req.headers, 'stripe')) {
    return res.status(401).send('Unauthorized');
  }
  const event = await router.parseWebhook(req.body, req.headers, 'stripe');
  // ...
});
```

### New Features (Optional)

#### Webhook Idempotency Store

Webhook providers retry delivery on non-2xx responses. Without idempotency protection, your handler may process the same event multiple times.

```typescript
import { PayBridgeRouter, InMemoryIdempotencyStore } from 'paybridge';

const router = new PayBridgeRouter({
  providers: [...],
  idempotencyStore: new InMemoryIdempotencyStore({ cleanupIntervalMs: 60000 })
});
```

See [Webhook Idempotency](/webhooks/idempotency) for details.

## 0.1 → 0.2

### Breaking Changes

#### 1. Webhook methods require `providerName` argument

**Before (0.1.x)**:

```typescript
const event = router.parseWebhook(req.body, req.headers);
```

**After (0.2.x)**:

```typescript
const event = router.parseWebhook(req.body, req.headers, 'stripe');
```

Prevents confused-deputy attacks.

#### 2. Providers must implement `getCapabilities()`

If you have custom providers, add:

```typescript
getCapabilities(): ProviderCapabilities {
  return {
    currencies: ['USD', 'EUR'],
    fees: { fixed: 0.30, percent: 2.9 },
    supportsRefunds: true,
    supportsSubscriptions: true,
  };
}
```

### New Features

- Multi-provider routing with circuit breakers
- 8 fiat + 2 crypto providers
- Routing strategies: cheapest, fastest, priority, round-robin
- E2E sandbox harnesses

See [CHANGELOG.md](https://github.com/kobie3717/paybridge/blob/master/CHANGELOG.md) for full list.

## Need Help?

- [Discord](https://discord.gg/Y2jCXNGgE)
- [GitHub Issues](https://github.com/kobie3717/paybridge/issues)
