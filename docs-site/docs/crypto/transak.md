# Transak

Global crypto on/off-ramp provider.

## Configuration

```typescript
import { CryptoRamp } from 'paybridge/crypto';

const ramp = new CryptoRamp({
  provider: 'transak',
  credentials: {
    apiKey: 'your_api_key',
    secretKey: 'your_secret_key'
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

## Supported features

- ✅ On-ramp (fiat → crypto)
- ✅ Off-ramp (crypto → fiat)
- ✅ Quote API
- ✅ Webhooks (HMAC-SHA256)
- ✅ Widget URL HMAC-SHA256 signing

## Supported assets

6 assets:
- USDT
- USDC
- BTC
- ETH
- MATIC
- BNB

## Widget signing

Transak uses HMAC-SHA256 widget URL signing similar to MoonPay. PayBridge handles this automatically.

## Webhook signature

Transak webhooks include HMAC-SHA256 signatures. Verify in production:

```typescript
if (!ramp.verifyWebhook(req.body, req.headers)) {
  return res.status(401).send('Unauthorized');
}
```

## Documentation

- [Transak API Docs](https://docs.transak.com)
