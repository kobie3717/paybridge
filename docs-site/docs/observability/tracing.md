# OpenTelemetry Tracing

PayBridge supports OpenTelemetry-compatible distributed tracing.

## What is tracing?

Distributed tracing instruments requests across services with spans (timed operations). Useful for:

- Request flow visualization
- Performance bottleneck identification
- Error propagation analysis

## Configuration

PayBridge routers accept an optional `tracer` implementing the OpenTelemetry `Tracer` interface:

```typescript
import { trace } from '@opentelemetry/api';
import { PayBridgeRouter } from 'paybridge';

const router = new PayBridgeRouter({
  providers: [...],
  tracer: trace.getTracer('paybridge')
});
```

## Span attributes

PayBridge emits spans per attempt with attributes:

| Attribute | Value |
|-----------|-------|
| `paybridge.provider` | `'stripe'`, `'yoco'`, etc. |
| `paybridge.strategy` | `'cheapest'`, `'fastest'`, etc. |
| `paybridge.attempt` | `1`, `2`, `3` (attempt number) |
| `paybridge.payment.id` | `'pay_123'` (if available) |
| `paybridge.payment.status` | `'completed'`, `'failed'`, etc. |
| `paybridge.error.code` | `'TIMEOUT'`, `'INVALID_CREDENTIALS'`, etc. |

## Example: OpenTelemetry setup

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { trace } from '@opentelemetry/api';

// Set up OpenTelemetry
const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({ endpoint: 'http://localhost:14268/api/traces' });
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

// Use with PayBridge
const router = new PayBridgeRouter({
  providers: [...],
  tracer: trace.getTracer('paybridge')
});
```

## Noop tracer (default)

If no tracer is configured, PayBridge uses a noop tracer (zero overhead, no spans emitted):

```typescript
const router = new PayBridgeRouter({
  providers: [...]
  // tracer defaults to noopTracer (zero overhead)
});
```

## Span hierarchy

```
createPayment (root span)
  ├── attempt 1: stripe (child span)
  │   └── HTTP POST /v1/checkout/sessions
  ├── attempt 2: yoco (child span, fallback)
  │   └── HTTP POST /online/v1/charges
```

## Example: Jaeger trace view

Visualize payment flow through multiple providers with Jaeger UI:

1. Parent span: `createPayment` (total duration)
2. Child spans: Each provider attempt with success/failure status
3. Attributes: Provider, strategy, payment ID, error code

## Integration with existing telemetry

PayBridge tracing integrates with your existing OpenTelemetry setup:

```typescript
import { trace, context } from '@opentelemetry/api';

// Start parent span in your handler
const span = trace.getTracer('app').startSpan('processOrder');
context.with(trace.setSpan(context.active(), span), async () => {
  
  // PayBridge spans will be children of 'processOrder'
  const payment = await router.createPayment({ ... });
  
  span.end();
});
```

## Next steps

- [Router events](/observability/events)
- [Payment ledger](/observability/ledger)
- [OpenTelemetry docs](https://opentelemetry.io/docs/)
