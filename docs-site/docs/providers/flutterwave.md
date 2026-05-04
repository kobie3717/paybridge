# Flutterwave

Pan-African payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'flutterwave',
  credentials: { apiKey: 'FLWSECK_TEST-...' },
  sandbox: true,
  webhookSecret: 'your_secret'
});
```

## Supported features

- ✅ One-time payments
- ✅ Recurring subscriptions (plan + payment flow)
- ✅ Refunds (smart tx_ref → flw_id resolution)
- ✅ Webhooks (simple-hash verification)

## Supported currencies

NGN, GHS, KES, UGX, ZAR, USD, EUR, GBP

## Webhook signature

Flutterwave uses simple-hash verification (no timestamp-based replay protection).

## Documentation

- [Flutterwave V3 Docs](https://developer.flutterwave.com/docs)
