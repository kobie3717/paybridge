# Router Events

PayBridgeRouter and CryptoRampRouter emit structured events for observability.

## Event emitter

Both routers expose a public `EventEmitter`:

```typescript
import { PayBridgeRouter } from 'paybridge';

const router = new PayBridgeRouter({ ... });

// Listen to specific event type
router.events.on('request.success', (event) => {
  console.log(`${event.provider} succeeded in ${event.durationMs}ms`);
});

// Listen to all events (wildcard)
router.events.on('*', (event) => {
  console.log('Event:', event);
});
```

## Event types

| Event type | Emitted when |
|------------|--------------|
| `attempt.start` | Router tries a provider |
| `attempt.success` | Provider request succeeded |
| `attempt.failure` | Provider request failed |
| `attempt.rate_limited` | Provider returned 429 or 503 with Retry-After |
| `attempt.timeout` | Provider request timed out |
| `circuit.opened` | Circuit breaker trips (5 failures) |
| `circuit.half_opened` | Circuit enters half-open (testing recovery) |
| `circuit.closed` | Circuit closes (provider recovered) |
| `webhook.duplicate` | Idempotency store detected duplicate webhook |
| `request.success` | Final result after all attempts |
| `request.failure` | All attempts failed (RoutingError thrown) |

## Event payload

All events include:

```typescript
{
  type: 'attempt.success',
  timestamp: 1614021600000,
  provider: 'stripe',
  operation: 'createPayment',
  durationMs: 245,
  paymentId?: 'pay_123',
  status?: 'completed',
  errorCode?: 'TIMEOUT',
  errorMessage?: 'Request timed out after 30000ms'
}
```

## Example: Structured logging

```typescript
router.events.on('*', (event) => {
  logger.info('Router event', {
    type: event.type,
    provider: event.provider,
    operation: event.operation,
    duration: event.durationMs,
    error: event.errorCode
  });
});
```

## Example: Prometheus metrics

```typescript
const attemptCounter = new Counter({
  name: 'paybridge_attempts_total',
  help: 'Total payment attempts',
  labelNames: ['provider', 'success']
});

router.events.on('attempt.success', (event) => {
  attemptCounter.inc({ provider: event.provider, success: 'true' });
});

router.events.on('attempt.failure', (event) => {
  attemptCounter.inc({ provider: event.provider, success: 'false' });
});
```

## Example: Circuit breaker alerts

```typescript
router.events.on('circuit.opened', async (event) => {
  await sendAlert({
    title: `Circuit breaker opened for ${event.provider}`,
    message: 'Provider is experiencing failures',
    severity: 'warning'
  });
});

router.events.on('circuit.closed', async (event) => {
  await sendAlert({
    title: `Circuit breaker closed for ${event.provider}`,
    message: 'Provider has recovered',
    severity: 'info'
  });
});
```

## Zero overhead

Events are only emitted if listeners are attached. No listeners = zero overhead.

## Next steps

- [Payment ledger](/observability/ledger)
- [OpenTelemetry tracing](/observability/tracing)
