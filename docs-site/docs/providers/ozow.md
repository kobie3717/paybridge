# Ozow

South African instant EFT payment provider.

## Configuration

```typescript
import { PayBridge } from 'paybridge';

const pay = new PayBridge({
  provider: 'ozow',
  credentials: {
    apiKey: 'your_api_key',
    siteCode: 'your_site_code',
    privateKey: 'your_private_key'
  },
  sandbox: true
});
```

## Credentials

- **apiKey**: Ozow API key
- **siteCode**: Ozow site code
- **privateKey**: SHA-512 hash signing key

Get credentials at [Ozow Hub](https://hub.ozow.com).

## Supported features

- ✅ One-time payments (EFT redirect-based)
- ⛔ Recurring subscriptions (not supported by Ozow API)
- ⛔ Refunds (not supported by Ozow API)
- ✅ Webhook parsing and verification

## Supported currencies

- ZAR (South African Rand)

## Status mapping

| Ozow status | PayBridge status |
|-------------|------------------|
| `Pending` | `pending` |
| `Complete` | `completed` |
| `Cancelled` | `cancelled` |
| `Error` | `failed` |

## Webhook signature

Ozow webhooks (ITN - Instant Transaction Notification) include a SHA-512 hash over a fixed field order. PayBridge verifies the hash using your `privateKey`.

## Known limitations

- **No subscriptions**: Ozow doesn't support recurring billing in their API
- **No refunds**: Ozow doesn't support programmatic refunds via API
- Use PayFast or Stripe for these features

## Documentation

- [Ozow API Docs](https://hub.ozow.com)
