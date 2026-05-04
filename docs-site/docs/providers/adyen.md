# Adyen

Global payment platform.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'adyen',
  credentials: {
    apiKey: 'your_api_key',
    merchantAccount: 'YourMerchantAccount',
    liveUrlPrefix: 'abc123' // Only for live mode
  },
  sandbox: true,
  webhookSecret: 'your_hmac_key_hex'
});
```

## Supported features

- ✅ One-time payments (Checkout Sessions API v71)
- ⛔ Recurring subscriptions (tokenization flow not yet supported)
- ✅ Refunds
- ✅ Webhooks (HMAC-SHA256 on NotificationRequestItem batch)

## Supported currencies

ZAR, EUR, USD, GBP, AUD, BRL, INR, NGN

## Known limitations

- **No subscriptions**: Adyen requires recurring tokenization flow not yet implemented

## Documentation

- [Adyen API Explorer](https://docs.adyen.com/api-explorer/)
