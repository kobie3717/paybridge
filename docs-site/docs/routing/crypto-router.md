# Crypto Router

`CryptoRampRouter` provides multi-provider routing for crypto on/off-ramp, parallel to fiat routing.

## Configuration

```typescript
import { CryptoRamp, CryptoRampRouter } from 'paybridge/crypto';

const moonpay = new CryptoRamp({ provider: 'moonpay', credentials: {...}, sandbox: true });
const transak = new CryptoRamp({ provider: 'transak', credentials: {...}, sandbox: true });

const router = new CryptoRampRouter({
  providers: [
    { provider: moonpay, weight: 1 },
    { provider: transak, weight: 1 }
  ],
  strategy: 'cheapest',
  excludeExperimental: true  // Excludes Yellow Card by default
});

const result = await router.createOnRamp({
  fiatAmount: 1000,
  fiatCurrency: 'ZAR',
  asset: 'USDT',
  network: 'POLYGON',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  customer: { email: 'customer@example.com' }
});

console.log(result.routingMeta.chosenProvider);
```

## Strategies

Same as fiat router:

- **cheapest**: Lowest fee
- **fastest**: Lowest `avgLatencyMs`
- **priority**: Highest weight first
- **round-robin**: Equal distribution

## Experimental providers

Yellow Card is marked `@experimental`. By default, `excludeExperimental: true` skips it.

To include experimental providers:

```typescript
const router = new CryptoRampRouter({
  providers: [...],
  excludeExperimental: false
});
```

## Circuit breaker

Crypto router shares the same circuit breaker implementation as fiat:

- 5 failures → OPEN
- 30s cooldown → HALF_OPEN
- 429-aware (rate limits don't trip)

Redis-backed store supported for multi-instance deployments.

## Observability

Same event types as fiat router:

```typescript
router.events.on('attempt.start', (event) => {
  console.log(`Trying ${event.provider} for ${event.operation}`);
});

router.events.on('request.success', (event) => {
  console.log(`Success via ${event.provider} in ${event.durationMs}ms`);
});
```

See [Observability / Events](/observability/events) for full reference.

## Next steps

- [Crypto provider overview](/crypto/overview)
- [Configure MoonPay](/crypto/moonpay)
- [Set up observability](/observability/events)
