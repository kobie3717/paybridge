# Yoco

South African card payment provider for SMEs.

## Configuration

```typescript
import { PayBridge } from 'paybridge';

const pay = new PayBridge({
  provider: 'yoco',
  credentials: {
    apiKey: 'sk_test_...' // Secret key
  },
  sandbox: true,
  webhookSecret: 'whsec_...'
});
```

## Credentials

- **apiKey**: Yoco secret key (starts with `sk_test_` for sandbox, `sk_live_` for production)
- **webhookSecret**: Webhook signing secret

Get credentials at [Yoco Developer Portal](https://developer.yoco.com).

## Supported features

- ✅ One-time payments
- ⛔ Recurring subscriptions (not supported by Yoco API)
- ✅ Full and partial refunds
- ✅ Webhook signature verification (Svix-style)

## Supported currencies

- ZAR (South African Rand)

## Status mapping

| Yoco status | PayBridge status |
|-------------|------------------|
| `pending` | `pending` |
| `succeeded` | `completed` |
| `failed` | `failed` |
| `cancelled` | `cancelled` |

## Webhook signature

Yoco uses Svix-style webhook signing with timestamp-based replay protection. PayBridge verifies signatures and rejects webhooks older than 300 seconds.

## Idempotency

Yoco mutations (createPayment, refund) include unique `Idempotency-Key` headers to prevent duplicate operations.

## Known limitations

- **No subscriptions**: Yoco's Online Payments API doesn't support recurring billing. Use PayFast or Stripe for subscriptions.

## Documentation

- [Yoco Developer Docs](https://developer.yoco.com)
