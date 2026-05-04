# Replay Protection

Replay protection prevents attackers from re-sending old valid webhooks to trigger duplicate actions.

## What is replay protection?

Timestamp-based replay protection rejects webhooks older than a threshold (typically 300 seconds).

**Without replay protection**: An attacker captures a valid webhook, waits 1 week, then replays it to trigger duplicate actions.

**With replay protection**: The webhook includes a timestamp. PayBridge rejects webhooks older than 5 minutes.

## Provider support

| Provider | Replay protection | Window |
|----------|-------------------|--------|
| **Stripe** | ✅ Timestamp in signature | 300s |
| **Yoco** | ✅ Svix-style timestamp | 299s pass, 301s reject |
| **Adyen** | ✅ Timestamp in payload | Provider-specific |
| **Mercado Pago** | ✅ `x-request-id` timestamp | 300s |
| **PayStack** | ❌ None | N/A |
| **Flutterwave** | ❌ None | N/A |
| **Razorpay** | ❌ None | N/A |
| **PayFast** | ❌ None | N/A |
| **Ozow** | ❌ None | N/A |
| **Peach** | ❌ None | N/A |
| **Mollie** | ❌ None | N/A |
| **Square** | ❌ None | N/A |
| **Pesapal** | ❌ None | N/A |
| **SoftyComp** | ✅ Provider-specific | Provider-specific |

## How it works (Stripe example)

Stripe signature header:

```
Stripe-Signature: t=1614021600,v1=5f3d...
```

PayBridge extracts the timestamp (`t=1614021600`) and compares to current time:

```typescript
const timestamp = parseInt(headers['stripe-signature'].match(/t=(\d+)/)[1]);
const now = Math.floor(Date.now() / 1000);

if (now - timestamp > 300) {
  throw new Error('Webhook timestamp too old (replay attack?)');
}
```

## Providers without replay protection

For providers without timestamp-based protection, PayBridge relies on:

1. **Signature verification** (proves authenticity)
2. **Idempotency store** (prevents duplicate processing)

This doesn't prevent replay attacks but mitigates their impact.

## Recommendations

For providers without replay protection:

- Always use an idempotency store
- Log webhook timestamps and monitor for suspicious patterns
- Consider rate-limiting webhook endpoints

## Next steps

- [Signature verification](/webhooks/signature-verification)
- [Idempotency store](/webhooks/idempotency)
