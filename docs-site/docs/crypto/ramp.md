# Ramp Network

Global crypto on/off-ramp provider.

## Configuration

```typescript
import { CryptoRamp } from 'paybridge/crypto';

const ramp = new CryptoRamp({
  provider: 'ramp',
  credentials: {
    apiKey: 'your_host_api_key' // Public key only
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

## Supported features

- ✅ On-ramp (fiat → crypto)
- ✅ Off-ramp (crypto → fiat)
- ✅ Quote API
- ✅ Webhooks (HMAC, migrating to ECDSA per Ramp spec)
- ⚠️ No widget signing (public `hostApiKey` only)

## Supported assets

6 assets:
- USDT
- USDC
- BTC
- ETH
- MATIC
- BNB

## Widget URL

Ramp Network widget URLs use a public `hostApiKey` with no HMAC signing required.

## Webhook signature

Current implementation uses HMAC verification. Ramp's actual spec recommends ECDSA; migration planned.

## Documentation

- [Ramp Network Docs](https://docs.ramp.network)
