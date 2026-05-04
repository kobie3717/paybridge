# Pesapal

East African payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'pesapal',
  credentials: {
    apiKey: 'qkio1BGG...',
    secretKey: 'osGQ364R...',
    notificationId: 'IPN123',
    username: 'merchant@example.com'
  },
  sandbox: true
});
```

## Supported features

- ✅ One-time payments
- ⛔ Recurring subscriptions (not yet supported)
- ✅ Refunds
- ⚠️ Webhooks (IPN, no signature scheme)

## Supported currencies

KES, UGX, TZS, USD

## Webhook security

Pesapal IPN has no signature scheme. Security relies on:
- `getPayment()` round-trip
- Source IP validation

## Notes

- OAuth-style token caching (5min expiry)
- Register IPN URL with Pesapal first to get `notificationId`

## Documentation

- [Pesapal API Reference](https://developer.pesapal.com/)
