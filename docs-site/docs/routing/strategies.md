# Routing Strategies

PayBridgeRouter supports 4 routing strategies for picking providers.

## Cheapest

Sorts providers by lowest fee (fixed + percent), then picks the first one.

**When to use**: Cost-sensitive applications where every basis point matters.

```typescript
const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },  // 1.5% fee
    { provider: yoco, weight: 1 },       // 2.95% fee
    { provider: stripe, weight: 1 }      // 2.9% + $0.30 fee
  ],
  strategy: 'cheapest'
});
```

For a R299 payment:
1. SoftyComp: R4.49
2. Stripe: R8.67 + R5.10 = R13.77
3. Yoco: R8.82

**Router picks SoftyComp.**

## Fastest

Sorts providers by lowest `avgLatencyMs`, then picks the first one.

**When to use**: Real-time checkout where speed matters (e.g., live event ticket sales).

```typescript
const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },  // 450ms avg
    { provider: yoco, weight: 1 },       // 280ms avg
    { provider: stripe, weight: 1 }      // 180ms avg
  ],
  strategy: 'fastest'
});
```

**Router picks Stripe (180ms).**

Providers with `null` or `undefined` latency sort last.

## Priority

Picks providers in order by `weight` (highest first). Weights are explicit priority scores.

**When to use**: You want deterministic provider preference (e.g., use Yoco first, fall back to Stripe).

```typescript
const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },
    { provider: yoco, weight: 3 },       // Highest priority
    { provider: stripe, weight: 2 }
  ],
  strategy: 'priority'
});
```

**Router picks Yoco (weight 3).**

On failure, falls back to Stripe (weight 2), then SoftyComp (weight 1).

## Round-robin

Rotates through providers evenly. State is per-router-instance.

**When to use**: Load distribution across providers, A/B testing.

```typescript
const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },
    { provider: yoco, weight: 1 },
    { provider: stripe, weight: 1 }
  ],
  strategy: 'round-robin'
});

await router.createPayment({ ... }); // → softycomp
await router.createPayment({ ... }); // → yoco
await router.createPayment({ ... }); // → stripe
await router.createPayment({ ... }); // → softycomp (wraps)
```

## Weights

Weights mean different things per strategy:

| Strategy | Weight meaning |
|----------|----------------|
| `cheapest` | Ignored (fees auto-calculated) |
| `fastest` | Ignored (latency auto-calculated) |
| `priority` | Priority score (higher = picked first) |
| `round-robin` | Ignored (equal distribution) |

## Fallback behavior

When a provider fails, the router tries the next provider in the sorted list:

```typescript
const router = new PayBridgeRouter({
  providers: [{ provider: yoco }, { provider: stripe }],
  strategy: 'cheapest',
  fallback: {
    enabled: true,
    maxAttempts: 3,
    retryDelayMs: 250  // Wait 250ms between attempts
  }
});
```

If Yoco times out, router waits 250ms then tries Stripe.

## Next steps

- [Configure circuit breaker](/routing/circuit-breaker)
- [Set up observability events](/observability/events)
