# Mollie

European payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'mollie',
  credentials: { apiKey: 'test_...' }, // Or live_... for production
  sandbox: true,
  webhookSecret: 'optional_secret'
});
```

## Supported features

- ✅ One-time payments
- ⛔ Recurring subscriptions (requires Customer + Mandate setup)
- ✅ Refunds
- ⚠️ Webhooks (no signature scheme, use getPayment() round-trip)

## Supported currencies

EUR, USD, GBP, CHF, CAD, AUD, DKK, SEK, NOK

## Webhook security

Mollie webhooks have no signature scheme. Security relies on:
- `getPayment()` round-trip to validate payment ID
- Source IP validation (Mollie IP ranges)

## Documentation

- [Mollie API Reference](https://docs.mollie.com/reference)
