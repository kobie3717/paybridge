# Circuit Breaker

PayBridge includes a circuit breaker to prevent cascading failures when a provider is down.

## How it works

The circuit breaker has 3 states:

1. **CLOSED** (normal): All requests go through
2. **OPEN** (tripped): Provider is skipped for 30s
3. **HALF_OPEN** (testing): One request allowed to test recovery

## State transitions

```
CLOSED → OPEN:    After 5 consecutive failures
OPEN → HALF_OPEN: After 30s timeout
HALF_OPEN → CLOSED: On successful request
HALF_OPEN → OPEN:   On failed request (retry 30s timeout)
```

## Configuration

Default settings:

```typescript
{
  failureThreshold: 5,      // Failures before tripping
  resetTimeoutMs: 30000,    // 30s cooldown
  halfOpenMaxAttempts: 1    // 1 test request when half-open
}
```

Custom settings:

```typescript
const router = new PayBridgeRouter({
  providers: [...],
  circuitBreaker: {
    failureThreshold: 10,
    resetTimeoutMs: 60000,  // 60s cooldown
    halfOpenMaxAttempts: 2
  }
});
```

## Rate-limit awareness

**429 and 503-with-Retry-After responses do NOT trip the circuit.**

Reasoning: rate-limiting ≠ provider failure. Tripping the circuit would only push more load to the next provider.

Rate-limited requests skip to the next provider but don't increment the failure counter.

## Multi-instance deployments (Redis)

By default, circuit breaker state is in-memory (per Node process). To share state across instances:

```typescript
import Redis from 'ioredis';
import { PayBridgeRouter, createRedisCircuitBreakerStore } from 'paybridge';

const redis = new Redis(process.env.REDIS_URL!);
const store = createRedisCircuitBreakerStore(redis, { prefix: 'app:cb:' });

const router = new PayBridgeRouter({
  providers: [...],
  circuitBreakerStore: store,
});
```

Works with both `ioredis` and `redis` (node-redis v4+).

## Observability

Circuit breaker emits events on state transitions:

```typescript
router.events.on('circuit.opened', (event) => {
  console.log(`Circuit opened for ${event.provider}`);
});

router.events.on('circuit.closed', (event) => {
  console.log(`Circuit closed for ${event.provider}`);
});

router.events.on('circuit.half_opened', (event) => {
  console.log(`Circuit half-open for ${event.provider}`);
});
```

See [Observability / Events](/observability/events) for full event reference.

## Example scenario

```typescript
// Provider fails 5 times
await router.createPayment({ ... }); // Fail 1
await router.createPayment({ ... }); // Fail 2
await router.createPayment({ ... }); // Fail 3
await router.createPayment({ ... }); // Fail 4
await router.createPayment({ ... }); // Fail 5 → Circuit OPEN

// Next request skips failed provider
await router.createPayment({ ... }); // Uses fallback immediately

// After 30s, circuit → HALF_OPEN
await router.createPayment({ ... }); // Test request
// If success → CLOSED
// If fail → OPEN again (retry 30s)
```

## Next steps

- [Set up Redis circuit breaker store](/routing/circuit-breaker#multi-instance-deployments-redis)
- [Monitor circuit events](/observability/events)
