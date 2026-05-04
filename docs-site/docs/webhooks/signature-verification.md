# Signature Verification

Webhook signature verification proves the request came from the payment provider, not an attacker.

## Why verify signatures?

Without verification, attackers can craft fake webhooks to:

- Mark unpaid orders as completed
- Trigger refunds
- Bypass payment flows

Always verify signatures in production.

## Verification methods by provider

PayBridge uses timing-safe comparison (`crypto.timingSafeEqual`) for all signature checks.

| Provider | Method | Replay protection |
|----------|--------|-------------------|
| **Stripe** | HMAC-SHA256 + timestamp | ✅ 300s window |
| **Yoco** | Svix-style HMAC-SHA256 | ✅ 300s window |
| **PayStack** | HMAC-SHA512 | ❌ None |
| **PayFast** | MD5 + passphrase | ❌ None |
| **Flutterwave** | Simple-hash | ❌ None |
| **Adyen** | HMAC-SHA256 on batch | ✅ Timestamp in payload |
| **Mercado Pago** | HMAC-SHA256 v1 | ✅ 300s window |
| **Razorpay** | HMAC-SHA256 | ❌ None |
| **Mollie** | ⚠️ No signature (use round-trip) | ❌ None |
| **Square** | HMAC-SHA256 + URL | ❌ None |
| **Pesapal** | ⚠️ No signature (use round-trip) | ❌ None |
| **SoftyComp** | HMAC-SHA256 | ✅ Provider-specific |
| **Ozow** | SHA-512 hash | ❌ None |
| **Peach** | AES-256-GCM decrypt | ❌ None |

## Timing-safe comparison

PayBridge uses `crypto.timingSafeEqual()` to prevent timing attacks:

```typescript
// ❌ Vulnerable to timing attacks
if (computedSignature === providedSignature) { ... }

// ✅ Timing-safe comparison
if (crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(providedSignature))) { ... }
```

## Providers without signatures

**Mollie** and **Pesapal** webhooks have no signature scheme. Security relies on:

1. `getPayment()` round-trip to validate payment ID
2. Source IP validation (provider IP ranges)

PayBridge's `verifyWebhook()` returns `true` for these providers but logs a warning.

## Webhook secrets

Most providers require a webhook secret (also called signing secret, HMAC key, etc.):

```typescript
const pay = new PayBridge({
  provider: 'stripe',
  credentials: { apiKey: 'sk_test_...' },
  webhookSecret: 'whsec_...'  // Get from Stripe Dashboard
});
```

If `webhookSecret` is not configured, `verifyWebhook()` returns `false` (fail-safe).

## Example: Stripe verification

Stripe signature header format:

```
Stripe-Signature: t=1614021600,v1=5f3d...,v0=deprecated
```

PayBridge extracts the timestamp and v1 signature, computes HMAC-SHA256, and compares:

```typescript
const timestamp = extractTimestamp(headers['stripe-signature']);
const signature = extractSignature(headers['stripe-signature']);
const payload = `${timestamp}.${rawBody}`;
const computed = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
  throw new Error('Invalid signature');
}

if (Date.now() / 1000 - timestamp > 300) {
  throw new Error('Webhook too old');
}
```

## Next steps

- [Replay protection](/webhooks/replay-protection)
- [Idempotency store](/webhooks/idempotency)
