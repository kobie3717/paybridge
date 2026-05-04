# MoonPay

Global crypto on/off-ramp provider.

## Configuration

```typescript
import { CryptoRamp } from 'paybridge/crypto';

const ramp = new CryptoRamp({
  provider: 'moonpay',
  credentials: {
    apiKey: 'pk_test_...',      // Publishable key
    secretKey: 'sk_test_...'    // Secret key (for widget signing)
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

## Credentials

- **apiKey**: MoonPay publishable key
- **secretKey**: MoonPay secret key (for HMAC widget URL signing)
- **webhookSecret**: Webhook signature verification secret

Get credentials at [MoonPay Dashboard](https://www.moonpay.com/dashboard).

## Supported features

- ✅ On-ramp (fiat → crypto)
- ✅ Off-ramp (crypto → fiat)
- ✅ Quote API
- ✅ Webhooks (V2 with 300s replay window)
- ✅ Widget URL HMAC-SHA256 signing

## Supported assets

6 assets across multiple networks:
- USDT (Ethereum, Polygon, Tron)
- USDC (Ethereum, Polygon)
- BTC (Bitcoin)
- ETH (Ethereum)
- MATIC (Polygon)
- BNB (BSC)

## Widget signing

MoonPay requires HMAC-SHA256 signed widget URLs in production. PayBridge handles signing automatically when `secretKey` is provided.

Signature verified against independent reference implementation.

## Webhook signature

MoonPay V2 webhooks include:
- HMAC-SHA256 signature header
- Timestamp-based replay protection (300s window)

Always verify webhook signatures:

```typescript
if (!ramp.verifyWebhook(req.body, req.headers)) {
  return res.status(401).send('Unauthorized');
}
```

## Known limitations

None. MoonPay supports all crypto features.

## Documentation

- [MoonPay API Docs](https://www.moonpay.com/developers)
