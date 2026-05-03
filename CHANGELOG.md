# Changelog

All notable changes to PayBridge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Redis-backed circuit-breaker for multi-instance deployments
- Yellow Card real spec verification (when partner docs available)
- CI/CD pipeline with GitHub Actions

## [0.2.0] - 2026-05-03

### Added
- **PayBridgeRouter** — multi-provider routing overlay with 4 strategies (cheapest, fastest, priority, round-robin), circuit-breaker (5 failures → OPEN, 30s → HALF_OPEN), and configurable fallback (default 3 attempts, 250ms backoff). Returns full attempt history via `result.routingMeta`.
- **Stripe provider** (production) — full Checkout Sessions API integration, 5 currencies (USD/EUR/GBP/ZAR/NGN), subscriptions, refunds, webhook signature verification with timestamp replay protection (300s).
- **PayFast provider** (production) — redirect-based checkout, MD5 passphrase signing per spec, subscriptions (monthly/quarterly/biannual/annual), ITN webhook parsing + verification (no-passphrase rejected).
- **PayStack provider** (production) — full Transactions + Plans API, 5 currencies (NGN/GHS/ZAR/USD/KES), two-step subscription flow (plan + transaction), refunds, HMAC-SHA512 webhook signature verification.
- **Yoco provider** (production) — replaces v0.1 stub. Yoco Online Payments API, ZAR, idempotency keys on mutations, refunds, Svix-style webhook signing with timestamp replay window. Subscriptions throw cleanly (Yoco doesn't support recurring in this API).
- **Ozow provider** (production) — replaces v0.1 stub. EFT redirect-based checkout, SHA-512 hash signing per spec, ITN webhook parse + verify, GET-by-reference status lookup. Subscriptions + refunds throw cleanly per Ozow API limits.
- **Peach Payments provider** (production) — Open Payment Platform integration, 4 currencies (ZAR/USD/EUR/GBP), form-encoded API, AES-256-GCM webhook decryption with fallback to plain JSON, status mapping by result-code prefix. Subscriptions throw cleanly (Registration + scheduled flow not yet supported).
- **Flutterwave provider** (production) — Flutterwave V3 API, 8 currencies (NGN/GHS/KES/UGX/ZAR/USD/EUR/GBP), hosted checkout, two-step subscription flow (plan + payment), smart refund ID resolution (tx_ref → flw_id), simple-hash webhook verification per Flutterwave spec.
- **CryptoRampRouter** — multi-provider crypto routing parallel to fiat router. Strategies: cheapest, priority, round-robin. Excludes experimental providers by default (configurable). Circuit-breaker reused from fiat side.
- **Crypto on/off-ramp drivers** — new `CryptoRamp` orchestrator + `CryptoRampProvider` abstract base.
  - **MoonPay driver** — production-ready. Widget URL HMAC-SHA256 signing (verified against spec via independent reference implementation), webhook V2 with 300s replay window, on-ramp + off-ramp via widget flow, status lookup via `/v3/transactions`.
  - **Yellow Card driver** — experimental. No public spec available; endpoint paths, headers, and signature scheme are speculative. Will not work without partner integration docs.
  - **Mock driver** — for testing.
- **Provider capabilities** — `getCapabilities()` on every provider returning fees, supported currencies, limits, country (used by router strategies).
- **Wallet address validation** — per-network regex (BTC, ETH, POLYGON, BSC, TRON) enforced at on-ramp / off-ramp entry.
- **E2E sandbox harnesses** — `tests/e2e/moonpay-sandbox.ts` (vector + spec replication + webhook roundtrip + optional live calls) and `tests/e2e/yellowcard-sandbox.ts` (same shape, internal-consistency only).
- New `tsx` devDependency for running e2e harnesses.
- Node.js native test runner (`node:test`) with 28+ unit tests.

### Changed
- `PaymentResult.routingMeta?` field added (optional, populated by router).
- `verifyWebhook` / `parseWebhook` on `PayBridgeRouter` now require a `provider` argument — prevents confused-deputy attacks where a webhook crafted to pass one provider's verification triggers another's handler. The single-provider `PayBridge` class is unchanged.
- Provider base now exposes `getCapabilities()`. All built-in providers updated. Existing custom providers extending `PaymentProvider` will need to implement this method.
- MoonPay: fixed widget URL HMAC missing leading `?` (would have caused MoonPay to reject every signed URL); off-ramp now uses sell widget host (`sell-sandbox.moonpay.com`) instead of buy host; status lookup migrated from `/v1/transactions` to `/v3/transactions`.
- Yoco capabilities fee changed from sandbox-split (1.49 / 2.95) to constant 2.95 (the actual public Yoco rate; sandbox-only discount was a placeholder).

### Security
- Webhook signature verification now uses `crypto.timingSafeEqual` (was `===`).
- `verifyWebhook` returns `false` when `webhookSecret` not configured (was `true`, an unauth bypass).
- Off-ramp `raw` response field strips `bankAccount` PII before returning to caller.
- Routing attempt errors sanitize secrets/tokens via regex before exposure to caller.
- Round-robin strategy state moved into router instance (was module-level closure shared across instances).
- Amount validation (`Number.isFinite`, `> 0`) at all payment / ramp entry points.

### Notes
- Circuit breaker state is in-memory only; not shared across processes. Persist to Redis if running multi-instance.
- Yellow Card driver is gated behind `@experimental` JSDoc + runtime warning. Do not use in production without partner spec confirmation.

## [0.1.0] - 2026-03-24

### Added
- Initial release of PayBridge
- Core unified API for payment providers
- TypeScript types and interfaces
- Provider abstraction layer (`PaymentProvider` base class)
- **SoftyComp provider** (fully functional)
  - One-time payments
  - Recurring subscriptions (monthly, yearly)
  - Payment status checking
  - Full and partial refunds
  - Webhook parsing and signature verification
- **Yoco provider** (structure ready, API calls TODO)
  - Types and interfaces defined
  - Webhook parsing structure
  - Signature verification structure
- **Ozow provider** (structure ready, API calls TODO)
  - Types and interfaces defined
  - Webhook parsing structure
  - SHA512 hash verification structure
- Currency utilities
  - Major/minor unit conversion (rands ↔ cents)
  - Currency formatting
  - Amount validation
- Documentation
  - Comprehensive README with examples
  - Usage examples (one-time, subscriptions, refunds, webhooks)
  - Provider comparison document
  - Express.js integration examples
- MIT License
- GitHub repository with topics

### Development
- TypeScript 5.9 configuration
- CommonJS build target (Node.js ≥18)
- Type declarations (.d.ts files)
- Git repository initialized
- GitHub repository created: [kobie3717/paybridge](https://github.com/kobie3717/paybridge)

[Unreleased]: https://github.com/kobie3717/paybridge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kobie3717/paybridge/releases/tag/v0.1.0
