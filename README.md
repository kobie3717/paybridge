# PayBridge

> **One API. Every payment provider. 🌍**

[![npm version](https://img.shields.io/npm/v/paybridge.svg)](https://www.npmjs.com/package/paybridge)
[![CI](https://github.com/kobie3717/paybridge/actions/workflows/test.yml/badge.svg)](https://github.com/kobie3717/paybridge/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-5865F2?logo=discord&logoColor=white)](https://discord.gg/Y2jCXNGgE)

📚 **[Documentation](https://kobie3717.github.io/paybridge/)** — full guides, provider reference, CLI docs, migration guides, examples.

Unified payment SDK for Node.js that works with multiple payment providers through a single, consistent API. Focus on South African providers first, with support for international gateways.

**WaSP is to WhatsApp what PayBridge is to payments** — one SDK, multiple backends, zero friction.

## Features

- **Unified API** — Same code works across all providers
- **TypeScript-first** — Full type safety and autocomplete
- **South African focus** — SoftyComp, Yoco, Ozow, PayFast ready
- **International support** — Stripe, PayStack, Peach Payments (coming soon)
- **Production-ready** — Webhooks, refunds, subscriptions, retries
- **Zero lock-in** — Switch providers by changing 1 config line

## Installation

```bash
npm install paybridge
```

## Interactive Playground

Want to see PayBridge in action before writing code? Try our **Stripe-style interactive playground**:

```bash
cd playground
npm install
npm start
```

Then open **http://localhost:4020** in your browser.

The playground lets you:
- Create real payments against SoftyComp sandbox
- Watch webhooks arrive in real-time
- Generate code snippets (TypeScript/JavaScript)
- Compare PayBridge vs raw API complexity
- Test all payment operations with a beautiful UI

Perfect for demos, learning, and rapid prototyping. See [playground/README.md](playground/README.md) for details.

## Framework Examples

Runnable integrations for common Node.js frameworks:

- [Express](examples/frameworks/express/) — classic, raw body parsing for webhooks
- [Fastify](examples/frameworks/fastify/) — Fastify plugin pattern, custom content type parser
- [Next.js](examples/frameworks/nextjs/) — App Router API routes, multi-provider router
- [Hono](examples/frameworks/hono/) — edge-runtime ready (Cloudflare Workers, Bun, Deno, Node)

Each example uses `PayBridgeRouter` with Stripe + PayStack and demonstrates webhook signature verification, idempotency, and provider-specific routing.

## Drift Detection

Payment providers change their APIs without notice. A field gets renamed, an endpoint moves, a type changes from `string` to `number`. Your integration silently breaks.

PayBridge includes **drift detection** — capture the shape of every provider's sandbox response, store it as a baseline, and get alerted the moment something changes.

### Quick Start

```bash
# Capture baselines (one-time setup)
npx paybridge drift-check --capture

# Check for drift
npx paybridge drift-check

# Watch continuously (6-hour interval)
npx paybridge drift-watch --interval 6h --webhook-url https://hooks.slack.com/...
```

### Example Output

```
=== Drift Detection ===

[✓] stripe — no drift
[⚠] mollie — drift detected:
    + new keys: data.expiresAt, _links.dashboard.href
    - removed keys: data.metadata.legacy
    ! type changed: data.amount.value (string → number)
[⚠] square — drift detected:
    + new keys: payment_link.created_at_iso
[ ] paystack — Missing: PAYSTACK_API_KEY
```

Exit code 1 if drift detected, 0 if clean. Perfect for CI/CD pipelines or cron jobs.

### Why It Matters

The Square `/checkout/payment-links → /online-checkout/payment-links` endpoint change would have shipped silently to production. With `drift-check` running daily, you get a Slack alert the moment it happens.

## Reconciliation

Webhooks can fail. Networks blip. Your server hiccups. Provider retries don't reach you. Without reconciliation, you discover missed webhooks when a customer complains their account wasn't credited.

PayBridge's **reconcile** command diffs your database against each provider's current state, catching payments where your local status doesn't match reality.

### Quick Start

```bash
# From JSONL file
echo '{"provider":"stripe","reference":"pay_001","expectedStatus":"pending"}' > expected.jsonl
npx paybridge reconcile --input expected.jsonl

# From SQL query (Postgres example)
psql -t -c "SELECT provider, reference, status AS \"expectedStatus\" FROM payments WHERE status='pending' AND created_at > now() - interval '24 hours'" \
  | npx paybridge reconcile

# CSV format
cat payments.csv | npx paybridge reconcile
```

### Example Output

```
[✓] stripe:pay_001 — completed (match)
[!] stripe:pay_002 — expected pending, actual completed (MISSED WEBHOOK)
[?] paystack:pay_003 — not-found (no provider record)
[✗] stripe:pay_004 — error (HTTP 503)
[ ] adyen:pay_005 — skipped (missing ADYEN_API_KEY)

Reconciled: 5
  Match: 1
  Mismatch (missed webhook): 1
  Not found: 1
  Error: 1
  Skipped: 1
```

Exit code 1 if any mismatch, 0 if clean. Add `--webhook-url` to POST mismatch reports to Slack/Discord/your ops channel. Use `--json` for pipeline integration.

## Postgres Ledger

The ledger stores every payment attempt and outcome. In-memory and Redis adapters are ephemeral. For durable transaction history, use the Postgres adapter.

### Schema Setup

Create the table once via your migration tool:

```typescript
import { getPostgresLedgerTableSql } from 'paybridge';

const sql = getPostgresLedgerTableSql();
await pool.query(sql);
```

Or run the SQL manually:

```sql
CREATE TABLE paybridge_ledger (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  reference TEXT,
  provider_id TEXT,
  status TEXT NOT NULL,
  amount NUMERIC,
  currency TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX idx_paybridge_ledger_provider_timestamp
  ON paybridge_ledger (provider, timestamp DESC);
CREATE INDEX idx_paybridge_ledger_reference
  ON paybridge_ledger (reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_paybridge_ledger_status
  ON paybridge_ledger (status);
```

### Usage

```typescript
import { Pool } from 'pg';
import { PayBridgeRouter, createPostgresLedgerStore } from 'paybridge';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ledger = createPostgresLedgerStore({ pool });

const router = new PayBridgeRouter({
  providers: [...],
  ledger,
});
```

Compatible with `pg` (`Pool`) and `postgres` (porsager) adapter wrappers. No runtime dep on `pg` — bring your own client.

## Quick Start

> **Upgrading from 0.1 or 0.2?** See [docs/migration.md](docs/migration.md).

### One-time Payment

```typescript
import { PayBridge } from 'paybridge';

// Initialize with your provider
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY,
    secretKey: process.env.SOFTYCOMP_SECRET_KEY
  },
  sandbox: true
});

// Create payment — same API regardless of provider
const payment = await pay.createPayment({
  amount: 299.00,        // Always in major currency unit (rands)
  currency: 'ZAR',
  reference: 'INV-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0825551234'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

// Redirect customer to payment page
console.log(payment.checkoutUrl);
// Payment details
console.log(payment.id);       // Provider payment ID
console.log(payment.status);   // 'pending' | 'completed' | 'failed' | 'cancelled'
console.log(payment.provider); // 'softycomp'
```

### Recurring Subscription

```typescript
const subscription = await pay.createSubscription({
  amount: 299.00,
  currency: 'ZAR',
  interval: 'monthly',     // 'weekly' | 'monthly' | 'yearly'
  reference: 'SUB-001',
  customer: {
    name: 'Jane Smith',
    email: 'jane@example.com'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  },
  startDate: '2026-04-01',  // Must be future date
  billingDay: 1             // Day of month (1-28)
});
```

### Refund

```typescript
// Full refund
const refund = await pay.refund({
  paymentId: 'pay_123'
});

// Partial refund
const refund = await pay.refund({
  paymentId: 'pay_123',
  amount: 100.00,
  reason: 'Customer request'
});
```

### Check Payment Status

```typescript
const payment = await pay.getPayment('pay_123');
if (payment.status === 'completed') {
  console.log('Payment received!');
}
```

### Webhooks

```typescript
import express from 'express';

const app = express();

// IMPORTANT: Use express.raw() for signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Verify webhook signature
  if (!pay.verifyWebhook(req.body, req.headers)) {
    return res.status(400).send('Invalid signature');
  }

  // Parse webhook event
  const event = pay.parseWebhook(req.body, req.headers);

  switch (event.type) {
    case 'payment.completed':
      console.log('Payment completed:', event.payment);
      // Fulfill order, activate subscription, etc.
      break;

    case 'payment.failed':
      console.log('Payment failed:', event.payment);
      // Notify customer
      break;

    case 'payment.cancelled':
      console.log('Payment cancelled:', event.payment);
      break;

    case 'refund.completed':
      console.log('Refund completed:', event.refund);
      break;
  }

  res.sendStatus(200);
});
```

## Supported Providers

### Fiat providers

| Provider | One-time | Subscriptions | Refunds | Webhooks | Status |
|----------|----------|---------------|---------|----------|--------|
| **SoftyComp** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Yoco** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Ozow** | ✅ | ⛔ | ⛔ | ✅ | **Production** |
| **PayFast** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **PayStack** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Stripe** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Peach Payments** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Flutterwave** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Adyen** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Mercado Pago** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Razorpay** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Mollie** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Square** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Pesapal** | ✅ | ⛔ | ✅ | ✅ | **Production** |

### Crypto on/off-ramp providers

| Provider | On-ramp | Off-ramp | Quote | Webhooks | Status |
|----------|---------|----------|-------|----------|--------|
| **MoonPay** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Yellow Card** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | **Experimental** |
| **Transak** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Ramp Network** | ✅ | ✅ | ✅ | ✅ | **Production** |

**Legend:** ✅ Supported | ⛔ Not supported by upstream API | ⚠️ Experimental (spec unverified)

**Notes:**
- `⛔` marks features the underlying provider's API doesn't support — those methods throw a clear error explaining the limitation. Use a different provider for that capability or use `PayBridgeRouter` to route accordingly.
- **Yellow Card** is gated behind `@experimental` until partner API documentation is verified — it logs a warning on instantiation. Do not use in production without partner-confirmed spec.
- **Sandbox testing.** PayFast / PayStack / Stripe / Peach / Flutterwave / Adyen / Mercado Pago / Razorpay are wired and unit-tested, but have not yet been validated against live sandbox credentials. To validate against real sandboxes, set the relevant `*_API_KEY` env vars and run `npm run test:e2e:sandbox`.

## Provider Configuration

### SoftyComp

```typescript
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

**Docs:** [SoftyComp API](https://webapps.softycomp.co.za)

### Yoco (Coming Soon)

```typescript
const pay = new PayBridge({
  provider: 'yoco',
  credentials: {
    apiKey: 'sk_test_...' // Secret key
  },
  sandbox: true,
  webhookSecret: 'whsec_...'
});
```

**Docs:** [Yoco Developer](https://developer.yoco.com)

### Ozow (Coming Soon)

```typescript
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

**Docs:** [Ozow Hub](https://hub.ozow.com)

### Adyen

```typescript
const pay = new PayBridge({
  provider: 'adyen',
  credentials: {
    apiKey: 'your_api_key',
    merchantAccount: 'YourMerchantAccount',
    liveUrlPrefix: 'abc123' // Only for live mode
  },
  sandbox: true,
  webhookSecret: 'your_hmac_key_hex'
});
```

**Docs:** [Adyen API Explorer](https://docs.adyen.com/api-explorer/)

**Note:** Adyen subscriptions require recurring tokenization flow (not yet supported). Use Stripe or PayFast for subscriptions.

### Mercado Pago

```typescript
const pay = new PayBridge({
  provider: 'mercadopago',
  credentials: {
    apiKey: 'TEST-...' // Or APP_USR-... for live
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

**Docs:** [Mercado Pago Developers](https://www.mercadopago.com/developers/en/reference)

### Razorpay

```typescript
const pay = new PayBridge({
  provider: 'razorpay',
  credentials: {
    apiKey: 'rzp_test_...', // key_id
    secretKey: 'your_key_secret'
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

**Docs:** [Razorpay API Reference](https://razorpay.com/docs/api)

**Note:** Razorpay webhooks do not include timestamp-based replay protection.

### Mollie

```typescript
const pay = new PayBridge({
  provider: 'mollie',
  credentials: {
    apiKey: 'test_...' // Or live_... for production
  },
  sandbox: true,
  webhookSecret: 'optional_webhook_secret'
});
```

**Docs:** [Mollie API Reference](https://docs.mollie.com/reference)

**Note:** Mollie subscriptions require Customer + Mandate setup (not yet supported by paybridge). Mollie webhooks have no signature scheme — security relies on getPayment() round-trip + source IP validation.

### Square

```typescript
const pay = new PayBridge({
  provider: 'square',
  credentials: {
    apiKey: 'EAAAEOuL...', // Access token
    locationId: 'LOCATION123',
    notificationUrl: 'https://example.com/webhook' // Required for signature verification
  },
  sandbox: true,
  webhookSecret: 'your_webhook_secret'
});
```

**Docs:** [Square API Reference](https://developer.squareup.com/reference/square)

**Note:** Square subscriptions require multi-step Catalog + Customer + Plan setup (not yet supported by paybridge). Webhook signature uses notificationUrl + raw body.

### Pesapal

```typescript
const pay = new PayBridge({
  provider: 'pesapal',
  credentials: {
    apiKey: 'qkio1BGG...', // consumer_key
    secretKey: 'osGQ364R...', // consumer_secret
    notificationId: 'IPN123', // Register IPN URL with Pesapal first
    username: 'merchant@example.com' // Required for refunds
  },
  sandbox: true,
  webhookSecret: 'optional_webhook_secret'
});
```

**Docs:** [Pesapal API Reference](https://developer.pesapal.com/)

**Note:** Pesapal subscriptions not yet supported. Pesapal IPN has no signature scheme — security relies on getPayment() round-trip + source IP validation. OAuth-style token caching (5min expiry).

## Switch Providers in 1 Line

```typescript
// Using SoftyComp
const pay1 = new PayBridge({ provider: 'softycomp', credentials: { ... } });

// Switch to Yoco — SAME API!
const pay2 = new PayBridge({ provider: 'yoco', credentials: { ... } });

// Switch to Ozow — SAME API!
const pay3 = new PayBridge({ provider: 'ozow', credentials: { ... } });

// All methods work identically
const payment = await pay1.createPayment({ ... }); // SoftyComp
const payment = await pay2.createPayment({ ... }); // Yoco
const payment = await pay3.createPayment({ ... }); // Ozow
```

## Why PayBridge?

South Africa's payment landscape is **fragmented**. Different providers for different use cases:

- **SoftyComp** — Debit orders and bill presentment
- **Yoco** — Card payments for SMEs
- **Ozow** — Instant EFT
- **PayFast** — Online payments

Each has its own SDK, quirks, and integration patterns. **PayBridge unifies them all.**

### Before PayBridge

```typescript
// SoftyComp
const softycomp = new SoftyComp({ ... });
const bill = await softycomp.createBill({ amount: 299.00, frequency: 'once-off', ... });

// Yoco
const yoco = new Yoco({ ... });
const checkout = await yoco.checkouts.create({ amountInCents: 29900, ... });

// Ozow
const ozow = new Ozow({ ... });
const payment = await ozow.initiatePayment({ Amount: '299.00', HashCheck: '...', ... });
```

**Different APIs, different amount formats, different field names.**

### With PayBridge

```typescript
// ONE API for all providers
const payment = await pay.createPayment({
  amount: 299.00,
  currency: 'ZAR',
  reference: 'INV-001',
  customer: { ... },
  urls: { ... }
});
```

**Same code. Every provider.**

## API Reference

### `PayBridge`

#### Constructor

```typescript
new PayBridge(config: PayBridgeConfig)
```

#### Methods

- `createPayment(params: CreatePaymentParams): Promise<PaymentResult>`
- `createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult>`
- `getPayment(id: string): Promise<PaymentResult>`
- `refund(params: RefundParams): Promise<RefundResult>`
- `parseWebhook(body: any, headers?: any): WebhookEvent`
- `verifyWebhook(body: any, headers?: any): boolean`
- `getProviderName(): string`
- `getSupportedCurrencies(): string[]`

### Types

See [src/types.ts](src/types.ts) for full type definitions.

## Multi-Provider Routing

PayBridge supports multi-provider routing with automatic failover and circuit breakers. Use `PayBridgeRouter` to route requests across multiple providers based on cost, priority, or round-robin.

```typescript
import { PayBridge, PayBridgeRouter } from 'paybridge';

const softycomp = new PayBridge({ provider: 'softycomp', credentials: {...}, sandbox: true });
const yoco = new PayBridge({ provider: 'yoco', credentials: {...}, sandbox: true });

const router = new PayBridgeRouter({
  providers: [
    { provider: softycomp, weight: 1 },
    { provider: yoco, weight: 2 }
  ],
  strategy: 'cheapest',
  fallback: {
    enabled: true,
    maxAttempts: 3,
    retryDelayMs: 250
  }
});

const payment = await router.createPayment({
  amount: 299.00,
  currency: 'ZAR',
  reference: 'INV-001',
  customer: { name: 'John Doe', email: 'john@example.com' },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

console.log(payment.routingMeta.chosenProvider);
console.log(payment.routingMeta.attempts);
```

### Multi-instance deployments (Redis circuit-breaker)

By default, each Node process has its own in-memory circuit breaker. To share circuit breaker state across multiple instances (e.g., behind a load balancer), use a Redis-backed store:

```typescript
import Redis from 'ioredis';
import { PayBridgeRouter, createRedisCircuitBreakerStore } from 'paybridge';

const redis = new Redis(process.env.REDIS_URL!);
const store = createRedisCircuitBreakerStore(redis, { prefix: 'app:cb:' });

const router = new PayBridgeRouter({
  providers: [...],
  circuitBreakerStore: store,
});
```

The Redis adapter works with both `ioredis` and `redis` (node-redis v4+) clients. State is eventually consistent across instances — race conditions during state transitions may cause a few extra failures, but correctness is preserved.

### Intelligent routing — successRate strategy

Static fee tables lie. PayBridge routes by actual outcomes when you give it ledger access:

```typescript
import { PayBridgeRouter, createSuccessRateStrategy, createPostgresLedgerStore } from 'paybridge';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ledger = createPostgresLedgerStore({ pool });

const strategy = createSuccessRateStrategy({
  ledger,
  windowMs: 24 * 60 * 60 * 1000,
  fallback: 'cheapest',
});

const router = new PayBridgeRouter({
  providers: [...],
  strategy,
  ledger,
});
```

Providers are ranked by their real success rate from your own traffic. Below the minimum sample size, the configured fallback (default `cheapest`) takes over.

**Why this matters**: A provider with 1.4% fee but 92% success rate costs more per successful transaction than a 2.5% / 99.5% provider. `successRate` makes routing decisions based on real outcomes from your traffic, not static fee tables.

## Currency Handling

PayBridge **always uses major currency units** (rands, dollars) in the API:

```typescript
// ✅ Correct
{ amount: 299.00, currency: 'ZAR' }

// ❌ Wrong (don't use cents)
{ amount: 29900, currency: 'ZAR' }
```

PayBridge handles provider-specific conversions internally:
- **SoftyComp** uses rands → no conversion
- **Yoco** uses cents → converts to cents
- **Ozow** uses rands → no conversion

## Error Handling

```typescript
try {
  const payment = await pay.createPayment({ ... });
} catch (error) {
  console.error('Payment failed:', error.message);
  // Handle error (invalid credentials, network error, etc.)
}
```

## Webhook Security

**Always verify webhook signatures in production:**

```typescript
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Verify signature
  if (!pay.verifyWebhook(req.body, req.headers)) {
    return res.status(401).send('Unauthorized');
  }

  // Signature valid — process event
  const event = pay.parseWebhook(req.body, req.headers);
  // ...
});
```

## Roadmap

- [x] **v0.1** — Core API + SoftyComp provider
- [ ] **v0.2** — Yoco provider
- [ ] **v0.3** — Ozow provider
- [ ] **v0.4** — PayFast provider
- [ ] **v0.5** — PayStack provider (Nigeria)
- [ ] **v0.6** — Stripe provider (international)
- [ ] **v0.7** — Peach Payments provider
- [ ] **v1.0** — Production-ready with all SA providers

## Contributing

We welcome contributions! To add a new payment provider:

1. Create `src/providers/yourprovider.ts` extending `PaymentProvider`
2. Implement all abstract methods
3. Add provider to `src/index.ts` factory
4. Update README with provider details
5. Submit PR

See [src/providers/softycomp.ts](src/providers/softycomp.ts) for reference implementation.

## Community

Join our Discord for support, feature discussions, and updates:

- **Discord:** [https://discord.gg/Y2jCXNGgE](https://discord.gg/Y2jCXNGgE)

## License

MIT © [Kobie Wentzel](https://github.com/kobie3717)

## Related Projects

- [**WaSP**](https://github.com/kobie3717/wasp) — Unified WhatsApp API (Baileys, Cloud API, Twilio)
- [**softycomp-node**](https://github.com/kobie3717/softycomp-node) — Official SoftyComp SDK

---

**Built with ❤️ in South Africa**
