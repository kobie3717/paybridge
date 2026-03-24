# PayBridge vs Native SDKs

This document compares PayBridge's unified API with native provider SDKs, demonstrating the value of abstraction.

## The Problem: Fragmented Payment Landscape

Each payment provider has its own SDK with different:
- API structures
- Amount formats (cents vs rands)
- Field names
- Response formats
- Webhook structures

**Result:** Switching providers requires rewriting all payment code.

## Example: Creating a R299 Payment

### SoftyComp (Native SDK)

```typescript
import { SoftyComp } from 'softycomp-node';

const client = new SoftyComp({
  apiKey: 'your_key',
  secretKey: 'your_secret',
  sandbox: true,
});

const bill = await client.createBill({
  amount: 299.00,                    // Rands
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerPhone: '0825551234',
  reference: 'INV-001',
  description: 'Payment',
  frequency: 'once-off',             // SoftyComp-specific
  returnUrl: 'https://myapp.com/success',
  cancelUrl: 'https://myapp.com/cancel',
  notifyUrl: 'https://myapp.com/webhook',
});

// Redirect to: bill.paymentUrl
```

### Yoco (Native API)

```typescript
import fetch from 'node-fetch';

const response = await fetch('https://payments.yoco.com/api/v1/checkouts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amount: 29900,                   // Cents (!)
    currency: 'ZAR',
    cancelUrl: 'https://myapp.com/cancel',
    successUrl: 'https://myapp.com/success',
    failureUrl: 'https://myapp.com/cancel',
    metadata: {
      reference: 'INV-001',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
    },
  }),
});

const checkout = await response.json();
// Redirect to: checkout.redirectUrl
```

### Ozow (Native API)

```typescript
import crypto from 'crypto';

// Generate SHA512 hash
const hashString = [
  siteCode,
  'ZA',
  'ZAR',
  '299.00',                          // Rands as string
  'INV-001',
  'INV-001',
  'john@example.com',
  '0825551234',
  '',
  '',
  '',
  'https://myapp.com/cancel',
  'https://myapp.com/cancel',
  'https://myapp.com/success',
  'https://myapp.com/webhook',
  'true',
  privateKey,
].join('');

const hash = crypto.createHash('sha512').update(hashString).digest('hex');

const response = await fetch('https://stagingapi.ozow.com/api/payments', {
  method: 'POST',
  headers: {
    'ApiKey': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    SiteCode: siteCode,
    CountryCode: 'ZA',
    CurrencyCode: 'ZAR',
    Amount: '299.00',
    TransactionReference: 'INV-001',
    BankReference: 'INV-001',
    Customer: 'John Doe',
    Optional1: 'john@example.com',
    Optional2: '0825551234',
    CancelUrl: 'https://myapp.com/cancel',
    ErrorUrl: 'https://myapp.com/cancel',
    SuccessUrl: 'https://myapp.com/success',
    NotifyUrl: 'https://myapp.com/webhook',
    IsTest: true,
    HashCheck: hash,
  }),
});

const payment = await response.json();
// Redirect to: payment.url
```

### PayBridge (Unified)

```typescript
import { PayBridge } from 'paybridge';

// Works with SoftyComp
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: { apiKey: '...', secretKey: '...' },
  sandbox: true,
});

// OR Yoco
const pay = new PayBridge({
  provider: 'yoco',
  credentials: { apiKey: '...' },
  sandbox: true,
});

// OR Ozow
const pay = new PayBridge({
  provider: 'ozow',
  credentials: { apiKey: '...', siteCode: '...', privateKey: '...' },
  sandbox: true,
});

// SAME CODE for all providers
const payment = await pay.createPayment({
  amount: 299.00,                    // Always rands
  currency: 'ZAR',
  reference: 'INV-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0825551234',
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook',
  },
});

// Redirect to: payment.checkoutUrl
```

## Webhooks Comparison

### SoftyComp (Native)

```typescript
// Webhook payload
{
  reference: "BILL-123",
  activityTypeID: 2,                // 2 = successful
  amount: 299.00,
  transactionDate: "2026-03-24T10:00:00Z",
  paymentMethodTypeID: 1,
  paymentMethodTypeDescription: "Card",
  userReference: "INV-001",
  information: ""
}

// Handler
if (webhook.activityTypeID === 2) {
  // Payment successful
}
```

### Yoco (Native)

```typescript
// Webhook payload
{
  type: "payment.succeeded",
  payload: {
    id: "ch_abc123",
    amount: 29900,                   // Cents
    currency: "ZAR",
    status: "succeeded",
    metadata: { reference: "INV-001" }
  }
}

// Handler
if (webhook.type === 'payment.succeeded') {
  const amountInRands = webhook.payload.amount / 100;
  // Payment successful
}
```

### Ozow (Native)

```typescript
// Webhook payload
{
  SiteCode: "ABC-123",
  TransactionId: "12345",
  TransactionReference: "INV-001",
  Amount: "299.00",
  Status: "Complete",               // "Complete" | "Cancelled" | "Error"
  CurrencyCode: "ZAR",
  IsTest: "true",
  Hash: "sha512_hash..."
}

// Handler
if (webhook.Status === 'Complete') {
  // Verify hash first!
  // Payment successful
}
```

### PayBridge (Unified)

```typescript
// Parse webhook
const event = pay.parseWebhook(req.body, req.headers);

// Unified format for ALL providers
{
  type: "payment.completed",         // Always kebab-case
  payment: {
    id: "...",
    status: "completed",             // Always: pending | completed | failed | cancelled
    amount: 299.00,                  // Always rands
    currency: "ZAR",
    reference: "INV-001",
    provider: "softycomp"            // Know which provider
  },
  raw: { ... }                       // Original payload if needed
}

// Handler (works for ALL providers)
switch (event.type) {
  case 'payment.completed':
    console.log(`Payment completed: R${event.payment.amount}`);
    break;
  case 'payment.failed':
    console.log('Payment failed');
    break;
}
```

## Code Reduction

### Before PayBridge

```typescript
// Need separate handlers for each provider
async function createPayment(provider: string, params: any) {
  if (provider === 'softycomp') {
    const client = new SoftyComp({ ... });
    return await client.createBill({
      amount: params.amount,
      customerName: params.customer.name,
      customerEmail: params.customer.email,
      customerPhone: params.customer.phone,
      reference: params.reference,
      frequency: 'once-off',
      returnUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      notifyUrl: params.webhookUrl,
    });
  }
  else if (provider === 'yoco') {
    const response = await fetch('...', {
      body: JSON.stringify({
        amount: params.amount * 100, // Convert to cents!
        currency: params.currency,
        cancelUrl: params.cancelUrl,
        successUrl: params.successUrl,
        metadata: { ... },
      }),
    });
    return await response.json();
  }
  else if (provider === 'ozow') {
    const hash = generateOzowHash({ ... });
    const response = await fetch('...', {
      body: JSON.stringify({
        SiteCode: siteCode,
        Amount: String(params.amount),
        Customer: params.customer.name,
        Optional1: params.customer.email,
        HashCheck: hash,
        // ... 15 more fields
      }),
    });
    return await response.json();
  }
}

// Need separate webhook handlers
function handleWebhook(provider: string, body: any) {
  if (provider === 'softycomp') {
    if (body.activityTypeID === 2) { /* ... */ }
  }
  else if (provider === 'yoco') {
    if (body.type === 'payment.succeeded') { /* ... */ }
  }
  else if (provider === 'ozow') {
    if (body.Status === 'Complete') { /* ... */ }
  }
}
```

**Total:** ~200+ lines of provider-specific code

### With PayBridge

```typescript
const pay = new PayBridge({ provider, credentials, sandbox });

const payment = await pay.createPayment({
  amount: params.amount,
  currency: params.currency,
  reference: params.reference,
  customer: params.customer,
  urls: params.urls,
});

const event = pay.parseWebhook(req.body, req.headers);
if (event.type === 'payment.completed') {
  // Handle completion
}
```

**Total:** ~20 lines. **90% reduction.**

## Switching Providers

### Before PayBridge

Switching from SoftyComp to Yoco requires:
1. Install new SDK
2. Update initialization code
3. Rewrite `createPayment` (different structure)
4. Rewrite `createSubscription` (different structure)
5. Update webhook handler (different payload)
6. Update amount conversion (rands → cents)
7. Update field mappings (customerName → metadata.name)
8. Test everything again

**Estimated time:** 2-4 hours

### With PayBridge

```typescript
// Before (SoftyComp)
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: { apiKey: '...', secretKey: '...' },
});

// After (Yoco) — ONLY CHANGE THIS
const pay = new PayBridge({
  provider: 'yoco',
  credentials: { apiKey: '...' },
});

// All other code stays EXACTLY the same
```

**Estimated time:** 30 seconds

## Feature Parity Table

| Feature | SoftyComp | Yoco | Ozow | PayBridge |
|---------|-----------|------|------|-----------|
| One-time payments | ✅ | ✅ | ✅ | ✅ |
| Subscriptions | ✅ | ⚠️ | ✅ | ✅ |
| Refunds | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Amount format | Rands | Cents | Rands | **Always Rands** |
| Signature verification | HMAC-SHA256 | Custom | SHA512 | **Automatic** |
| TypeScript types | ✅ | ❌ | ❌ | ✅ |
| Unified API | ❌ | ❌ | ❌ | ✅ |

## Real-World Use Case

**Scenario:** You build an e-commerce site using SoftyComp. After 6 months, you want to add Yoco for better card payment UX.

### Without PayBridge

```typescript
// payment-service.ts
async function createPayment(provider: 'softycomp' | 'yoco', params: any) {
  if (provider === 'softycomp') {
    // SoftyComp logic (50 lines)
  } else {
    // Yoco logic (50 lines)
  }
}

async function handleWebhook(provider: 'softycomp' | 'yoco', body: any) {
  if (provider === 'softycomp') {
    // SoftyComp webhook logic (30 lines)
  } else {
    // Yoco webhook logic (30 lines)
  }
}

// Total: ~160 lines of duplicated logic
```

### With PayBridge

```typescript
// payment-service.ts
const providers = {
  softycomp: new PayBridge({ provider: 'softycomp', ... }),
  yoco: new PayBridge({ provider: 'yoco', ... }),
};

async function createPayment(provider: 'softycomp' | 'yoco', params: any) {
  return providers[provider].createPayment(params);
}

async function handleWebhook(provider: 'softycomp' | 'yoco', body: any, headers: any) {
  return providers[provider].parseWebhook(body, headers);
}

// Total: ~20 lines. Same code for both providers.
```

## The WaSP Analogy

**WaSP** did for WhatsApp what **PayBridge** does for payments:

| WaSP (WhatsApp) | PayBridge (Payments) |
|-----------------|---------------------|
| Baileys, Cloud API, Twilio | SoftyComp, Yoco, Ozow |
| Different message formats | Different payment structures |
| Different auth methods | Different credential types |
| Different webhooks | Different webhook payloads |
| **One unified API** | **One unified API** |

## Conclusion

**PayBridge Value:**
- ✅ **Write once, run anywhere** — Same code across all providers
- ✅ **No vendor lock-in** — Switch providers in seconds
- ✅ **Type safety** — Full TypeScript support
- ✅ **Consistent amounts** — Always major currency units (rands)
- ✅ **Automatic conversions** — Handles cents/rands internally
- ✅ **Unified webhooks** — One event format for all
- ✅ **Less code** — 90% reduction vs native SDKs
- ✅ **Future-proof** — New providers added without breaking changes

**Bottom line:** PayBridge is to payments what WaSP is to WhatsApp — **abstraction that just works**.
