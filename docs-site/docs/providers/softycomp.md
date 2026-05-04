# SoftyComp

South African debit order and bill presentment provider.

## Configuration

```typescript
import { PayBridge } from 'paybridge';

const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: 'your_api_key',
    secretKey: 'your_secret_key'
  },
  sandbox: true,
  webhookSecret: 'optional_webhook_secret'
});
```

## Credentials

- **apiKey**: SoftyComp API key
- **secretKey**: SoftyComp secret key
- **webhookSecret** (optional): Secret for webhook signature verification

Get credentials at [SoftyComp Web Apps](https://webapps.softycomp.co.za).

## Supported features

- ✅ One-time payments
- ✅ Recurring subscriptions (monthly, yearly)
- ✅ Full and partial refunds
- ✅ Webhook signature verification

## Supported currencies

- ZAR (South African Rand)

## Status mapping

| SoftyComp status | PayBridge status |
|------------------|------------------|
| `pending` | `pending` |
| `completed` | `completed` |
| `failed` | `failed` |
| `cancelled` | `cancelled` |

## Webhook signature

SoftyComp webhooks include a signature header. PayBridge verifies signatures using HMAC-SHA256 with your `webhookSecret`.

Always verify webhook signatures in production:

```typescript
if (!pay.verifyWebhook(req.body, req.headers)) {
  return res.status(401).send('Unauthorized');
}
```

## Known limitations

None. SoftyComp supports all PayBridge features.

## Documentation

- [SoftyComp API](https://webapps.softycomp.co.za)
- [softycomp-node SDK](https://github.com/kobie3717/softycomp-node)
