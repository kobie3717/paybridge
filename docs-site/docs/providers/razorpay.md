# Razorpay

Indian payment provider.

## Configuration

```typescript
const pay = new PayBridge({
  provider: 'razorpay',
  credentials: {
    apiKey: 'rzp_test_...',
    secretKey: 'your_key_secret'
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

## Supported features

- ✅ One-time payments (Orders API)
- ✅ Recurring subscriptions (Plans + Subscriptions)
- ✅ Refunds (payment_id auto-resolves order_id)
- ✅ Webhooks (HMAC-SHA256)

## Supported currencies

INR, USD, EUR, GBP, SGD, AED, AUD

## Webhook signature

Razorpay webhooks have no timestamp-based replay protection.

## Documentation

- [Razorpay API Reference](https://razorpay.com/docs/api)
