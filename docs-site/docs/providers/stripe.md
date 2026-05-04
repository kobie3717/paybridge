# Stripe

Global payment provider with support for 135+ currencies.

## Configuration

```typescript
import { PayBridge } from 'paybridge';

const pay = new PayBridge({
  provider: 'stripe',
  credentials: {
    apiKey: 'sk_test_...' // Secret key
  },
  sandbox: true,
  webhookSecret: 'whsec_...'
});
```

## Credentials

- **apiKey**: Stripe secret key (starts with `sk_test_` for sandbox, `sk_live_` for production)
- **webhookSecret**: Webhook signing secret from Stripe Dashboard

Get credentials at [Stripe Dashboard](https://dashboard.stripe.com).

## Supported features

- ✅ One-time payments
- ✅ Recurring subscriptions (monthly, yearly, weekly)
- ✅ Full and partial refunds
- ✅ Webhook signature verification with timestamp replay protection

## Supported currencies

5 currencies via PayBridge (full Stripe supports 135+):

- USD (US Dollar)
- EUR (Euro)
- GBP (British Pound)
- ZAR (South African Rand)
- NGN (Nigerian Naira)

## Status mapping

| Stripe status | PayBridge status |
|---------------|------------------|
| `open` | `pending` |
| `complete` | `completed` |
| `expired` | `failed` |

## Webhook signature

Stripe webhooks include a `Stripe-Signature` header with HMAC-SHA256 signatures and a timestamp. PayBridge verifies signatures and rejects webhooks older than 300 seconds (Stripe default).

## Known limitations

None. Stripe supports all PayBridge features.

## Documentation

- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Checkout Sessions](https://stripe.com/docs/payments/checkout)
