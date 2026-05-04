# PayFast

South African online payment provider.

## Configuration

```typescript
import { PayBridge } from 'paybridge';

const pay = new PayBridge({
  provider: 'payfast',
  credentials: {
    merchantId: 'your_merchant_id',
    merchantKey: 'your_merchant_key',
    passphrase: 'your_passphrase' // optional
  },
  sandbox: true,
  webhookSecret: 'optional_webhook_secret'
});
```

## Credentials

- **merchantId**: PayFast merchant ID
- **merchantKey**: PayFast merchant key
- **passphrase** (optional): MD5 passphrase for enhanced security
- **webhookSecret** (optional): Additional secret for webhook verification

Get credentials at [PayFast Dashboard](https://www.payfast.co.za).

## Supported features

- ✅ One-time payments
- ✅ Recurring subscriptions (monthly, quarterly, biannual, annual)
- ✅ Full and partial refunds
- ✅ Webhook signature verification (ITN)

## Supported currencies

- ZAR (South African Rand)

## Status mapping

| PayFast status | PayBridge status |
|----------------|------------------|
| `PENDING` | `pending` |
| `COMPLETE` | `completed` |
| `FAILED` | `failed` |
| `CANCELLED` | `cancelled` |

## Webhook signature

PayFast webhooks (ITN - Instant Transaction Notification) use MD5 signature verification with optional passphrase. PayBridge validates:

1. MD5 signature over sorted fields
2. Server IP validation (PayFast IP ranges)
3. Payment amount match via `getPayment()` round-trip

Always configure a passphrase in production for enhanced security.

## Known limitations

None. PayFast supports all PayBridge features.

## Documentation

- [PayFast API Docs](https://developers.payfast.co.za)
