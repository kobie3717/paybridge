# Success Rate Strategy

Route by real outcomes, not static fee tables.

## Why success rate matters

A provider with 1.4% fee but 92% success rate costs **more per successful transaction** than a 2.5% / 99.5% provider.

Static fee tables lie. The `successRate` strategy ranks providers by actual transaction outcomes from your own traffic.

## Setup

Requires a ledger (Postgres recommended for production):

```typescript
import { Pool } from 'pg';
import {
  PayBridgeRouter,
  createSuccessRateStrategy,
  createPostgresLedgerStore
} from 'paybridge';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ledger = createPostgresLedgerStore({ pool });

const strategy = createSuccessRateStrategy({
  ledger,
  windowMs: 24 * 60 * 60 * 1000,      // Look back 24 hours
  cacheTtlMs: 60 * 1000,               // Refresh cached rates every 60s
  minSampleSize: 10,                   // Require 10+ attempts for high confidence
  fallback: 'cheapest'                 // Use cheapest for low-confidence providers
});

const router = new PayBridgeRouter({
  providers: [
    { provider: yoco },
    { provider: stripe },
    { provider: ozow }
  ],
  strategy,
  ledger
});
```

## How it works

1. Query ledger for all attempts in the last `windowMs`
2. Compute success rate per provider: `success_count / total_count`
3. Providers with `>= minSampleSize` attempts are ranked by success rate (high to low)
4. Providers with `< minSampleSize` fall through to the fallback strategy
5. Cache rates for `cacheTtlMs` (default 60s)

## Example

Your traffic over the last 24h:

| Provider | Success | Failure | Total | Success Rate |
|----------|---------|---------|-------|--------------|
| Yoco     | 495     | 5       | 500   | 99.0%        |
| Stripe   | 190     | 10      | 200   | 95.0%        |
| Ozow     | 8       | 0       | 8     | 100%         |

With `minSampleSize: 10`:
- **Yoco** (99.0%, 500 samples) — ranked #1
- **Stripe** (95.0%, 200 samples) — ranked #2
- **Ozow** (100%, 8 samples) — falls through to fallback (too few samples)

If fallback is `'cheapest'`, Ozow is sorted by fee with any other low-confidence providers.

## Configuration options

```typescript
interface SuccessRateStrategyOptions {
  ledger: LedgerStore;
  windowMs?: number;          // Default: 24 hours
  cacheTtlMs?: number;        // Default: 60 seconds
  minSampleSize?: number;     // Default: 10
  fallback?: 'cheapest' | 'fastest' | 'priority' | 'round-robin';  // Default: 'cheapest'
}
```

## When to use

- **High-volume merchants**: Enough traffic to build statistically significant samples
- **Variable provider reliability**: Providers have different success rates in your region/use-case
- **Cost-conscious routing**: Want to pay for successful transactions, not attempts

## When NOT to use

- **Low-volume merchants**: <100 payments/day won't build enough samples
- **Cold start**: No historical data yet (falls back to the configured fallback strategy)
- **Static provider reliability**: All providers have >99% success rates (use `cheapest` instead)

## Inspecting rates

Debug or observability dashboards:

```typescript
const rates = strategy.getRates();

for (const [provider, stats] of rates.entries()) {
  console.log(`${provider}: ${(stats.successRate * 100).toFixed(1)}% (n=${stats.sampleSize})`);
}
```

Output:
```
yoco: 99.0% (n=500)
stripe: 95.0% (n=200)
ozow: 100.0% (n=8)
```

## Force refresh

Refresh cached rates before the TTL expires:

```typescript
await strategy.refresh();
```

Useful for:
- Scheduled jobs that want fresh data
- Admin dashboards that show current rates
- Debugging rate calculation

## Cold start behavior

When the ledger is empty or all providers have `< minSampleSize` attempts, **all** providers fall through to the fallback strategy.

```typescript
const strategy = createSuccessRateStrategy({
  ledger,
  fallback: 'priority'
});

const router = new PayBridgeRouter({
  providers: [
    { provider: yoco, priority: 10 },
    { provider: stripe, priority: 5 }
  ],
  strategy,
  ledger
});
```

Until you have 10+ attempts per provider, routing uses priority weights.

## Edge cases

**What if a provider has 100% success but only 5 attempts?**  
Falls through to fallback (below `minSampleSize`).

**What if two providers have the same success rate?**  
Order is undefined (typically insertion order from the ledger query).

**What if the ledger query fails?**  
Strategy throws. Wrap in try/catch or monitor router events.

## Next steps

- [Postgres Ledger Setup](/observability/postgres-ledger)
- [Routing Overview](/routing/overview)
- [Router Events](/observability/events)
