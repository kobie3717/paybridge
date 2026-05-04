# Payment Ledger

PayBridge includes an optional ledger for persisting every payment attempt and outcome.

## What is the ledger?

A pluggable store that records every provider request with:

- Timestamp
- Provider name
- Operation (createPayment, refund, etc.)
- Status (success, failure, timeout, rate_limited)
- Reference ID
- Duration
- Error details

Useful for:

- Audit trails
- Debugging failed payments
- Provider performance analysis
- Reconciliation

## In-memory ledger

```typescript
import { PayBridgeRouter, InMemoryLedgerStore } from 'paybridge';

const ledger = new InMemoryLedgerStore({
  maxSize: 10000  // FIFO, drops oldest when full
});

const router = new PayBridgeRouter({
  providers: [...],
  ledger
});
```

## Redis ledger

Recommended for multi-instance deployments:

```typescript
import Redis from 'ioredis';
import { createRedisLedgerStore } from 'paybridge';

const redis = new Redis(process.env.REDIS_URL);
const ledger = createRedisLedgerStore({
  redis,
  keyPrefix: 'app:ledger:',
  ttlSeconds: 2592000  // 30 days
});

const router = new PayBridgeRouter({
  providers: [...],
  ledger
});
```

## Ledger entry schema

```typescript
interface LedgerEntry {
  timestamp: number;          // Unix timestamp (ms)
  provider: string;           // 'stripe', 'yoco', etc.
  operation: string;          // 'createPayment', 'refund', etc.
  status: 'success' | 'failure' | 'timeout' | 'rate_limited';
  reference: string;          // Payment ID or reference
  durationMs: number;         // Request duration
  errorCode?: string;         // 'TIMEOUT', 'INVALID_CREDENTIALS', etc.
  errorMessage?: string;      // Human-readable error
}
```

## Querying the ledger

In-memory store:

```typescript
const entries = await ledger.getEntries({ provider: 'stripe', limit: 100 });
```

Redis store (range query):

```typescript
const entries = await ledger.getEntries({
  provider: 'stripe',
  startTime: Date.now() - 86400000,  // Last 24h
  endTime: Date.now(),
  limit: 1000
});
```

## Non-fatal failures

Ledger writes are non-fatal. If Redis is down, the request still succeeds and a warning is emitted as an event:

```typescript
router.events.on('ledger.write_failed', (event) => {
  console.warn('Ledger write failed:', event.error);
});
```

## Example: Provider performance report

```typescript
const entries = await ledger.getEntries({
  startTime: Date.now() - 86400000,  // Last 24h
  endTime: Date.now()
});

const stats = entries.reduce((acc, entry) => {
  if (!acc[entry.provider]) {
    acc[entry.provider] = { success: 0, failure: 0, totalDuration: 0 };
  }
  if (entry.status === 'success') {
    acc[entry.provider].success++;
  } else {
    acc[entry.provider].failure++;
  }
  acc[entry.provider].totalDuration += entry.durationMs;
  return acc;
}, {});

console.table(stats);
```

## Next steps

- [Router events](/observability/events)
- [OpenTelemetry tracing](/observability/tracing)
