# Peach Payments

South African and international payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'peach',
  credentials: {
    apiKey: 'your_access_token',
    secretKey: 'your_entity_id'
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

## Supported features

- ✅ One-time payments
- ⛔ Recurring subscriptions (tokenization flow not yet supported)
- ✅ Refunds
- ✅ Webhooks (AES-256-GCM decryption)

## Supported currencies

ZAR, USD, EUR, GBP

## Known limitations

- **No subscriptions**: Peach requires Registration + scheduled payment flow not yet implemented in PayBridge

## Documentation

- [Peach OPP Docs](https://peachpayments.docs.oppwa.com)
