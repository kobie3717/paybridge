# PayStack

African payment provider supporting Nigeria, Ghana, South Africa, Kenya, and more.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'paystack',
  credentials: { apiKey: 'sk_test_...' },
  sandbox: true,
  webhookSecret: 'your_secret'
});
```

## Supported features

- ✅ One-time payments
- ✅ Recurring subscriptions
- ✅ Refunds
- ✅ Webhooks (HMAC-SHA512)

## Supported currencies

NGN, GHS, ZAR, USD, KES

## Documentation

- [PayStack Docs](https://paystack.com/docs)
