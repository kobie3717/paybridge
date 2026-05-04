# Square

US payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'square',
  credentials: {
    apiKey: 'EAAAEOuL...',
    locationId: 'LOCATION123',
    notificationUrl: 'https://example.com/webhook'
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

## Supported features

- ✅ One-time payments (Payment Links API)
- ⛔ Recurring subscriptions (multi-step Catalog flow not supported)
- ✅ Refunds
- ✅ Webhooks (HMAC-SHA256 with notification URL)

## Supported currencies

USD, CAD, GBP, AUD, EUR, JPY

## Webhook signature

Square webhook signatures use HMAC-SHA256 over `notificationUrl + body`.

## Documentation

- [Square API Reference](https://developer.squareup.com/reference/square)
