---
layout: home
hero:
  name: PayBridge
  text: One API. Every payment provider.
  tagline: 14 fiat + 4 crypto providers behind a smart router. Zero runtime deps. TypeScript-first.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/kobie3717/paybridge

features:
  - title: 14 fiat providers
    details: SoftyComp, Yoco, Ozow, PayFast, PayStack, Stripe, Peach, Flutterwave, Adyen, Mercado Pago, Razorpay, Mollie, Square, Pesapal
  - title: Crypto on/off-ramp
    details: MoonPay (verified), Transak, Ramp Network. Same API shape as fiat. Yellow Card experimental.
  - title: Smart routing
    details: 4 strategies (cheapest, fastest, priority, round-robin). Automatic failover with circuit breaker. 429-aware.
  - title: Webhook idempotency
    details: Pluggable in-memory or Redis store. Dedupes by event ID. WebhookDuplicateError on retries.
  - title: Observability
    details: EventEmitter on routers. Pluggable ledger. OTel-compatible tracer.
  - title: Zero runtime deps
    details: Native fetch + node:crypto only. TypeScript strict. 354 unit tests. CI on Node 18 / 20 / 22.
---

## Why PayBridge?

South Africa's payment landscape is fragmented. Different providers for different use cases:

- **SoftyComp** — Debit orders and bill presentment
- **Yoco** — Card payments for SMEs
- **Ozow** — Instant EFT
- **PayFast** — Online payments

Each has its own SDK, quirks, and integration patterns. PayBridge unifies them all.

## One line to switch providers

```typescript
// Using SoftyComp
const pay1 = new PayBridge({ provider: 'softycomp', credentials: { ... } });

// Switch to Yoco — SAME API
const pay2 = new PayBridge({ provider: 'yoco', credentials: { ... } });

// All methods work identically
const payment = await pay1.createPayment({ ... }); // SoftyComp
const payment = await pay2.createPayment({ ... }); // Yoco
```

## Community

- **Discord**: [Join our community](https://discord.gg/Y2jCXNGgE)
- **npm**: [paybridge](https://www.npmjs.com/package/paybridge)
- **GitHub**: [kobie3717/paybridge](https://github.com/kobie3717/paybridge)
