# Mercado Pago

Latin America payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'mercadopago',
  credentials: { apiKey: 'TEST-...' }, // Or APP_USR-... for live
  sandbox: true,
  webhookSecret: 'your_secret'
});
```

## Supported features

- ✅ One-time payments (Checkout Preferences)
- ✅ Recurring subscriptions (preapproval-based)
- ✅ Refunds
- ✅ Webhooks (HMAC-SHA256 v1, 300s replay window)

## Supported currencies

BRL, ARS, USD, MXN, COP, CLP, ZAR

## Documentation

- [Mercado Pago API](https://www.mercadopago.com/developers/en/reference)
