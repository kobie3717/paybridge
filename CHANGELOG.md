# Changelog

All notable changes to PayBridge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Yellow Card real spec verification (when partner docs available)

## [0.6.0] - 2026-05-04

### Added
- **Mollie provider** (production) — EU-focused, 9 currencies (EUR/USD/GBP/CHF/CAD/AUD/DKK/SEK/NOK), payments + refunds. Subscriptions throw cleanly (Mollie requires Customer + Mandate setup not yet supported). Webhook verification documented as not-supported by Mollie's API design (use getPayment round-trip).
- **Square provider** (production) — Payment Links API, 6 currencies (USD/CAD/GBP/AUD/EUR/JPY), idempotency keys, two-step status lookup (link → order), HMAC-SHA256 webhook with notification URL. Subscriptions throw cleanly (multi-step Catalog flow not yet supported).
- **Pesapal provider** (production) — East Africa focus, 4 currencies (KES/UGX/TZS/USD), OAuth-style token caching, IPN-based webhook (no signature scheme; getPayment round-trip required).
- **Transak crypto driver** (production) — global on/off-ramp, 6 assets, HMAC-SHA256 widget URL signing similar to MoonPay, status lookup via /api/v2/orders.
- **Ramp Network crypto driver** (production) — global on/off-ramp, 6 assets, no widget signing (public hostApiKey only), HMAC webhook (TODO: migrate to ECDSA per Ramp's actual spec).

### Changed
- Added `'mollie' | 'square' | 'pesapal'` to `Provider` union (additive).
- Added `'transak' | 'ramp'` to crypto provider union (additive).

## [0.5.0] - 2026-05-04

### Added
- **Adyen provider** (production) — Checkout v71 sessions API, 8 currencies (ZAR/EUR/USD/GBP/AUD/BRL/INR/NGN), refunds via /payments/{id}/refunds, HMAC-SHA256 webhook verification on NotificationRequestItem batch envelope. Subscriptions throw cleanly (Adyen requires recurring tokenization not yet supported).
- **Mercado Pago provider** (production) — Checkout Preferences API, 7 currencies (BRL/ARS/USD/MXN/COP/CLP/ZAR), preapproval-based subscriptions (weekly/monthly/yearly mapped to frequency_type), refunds, HMAC-SHA256 v1 webhook signature with 300s replay window.
- **Razorpay provider** (production) — Orders + Plans API, 7 currencies (INR/USD/EUR/GBP/SGD/AED/AUD), HTTP Basic auth, two-step subscription flow (plan + subscription), refunds via payment_id (auto-resolves order_id), HMAC-SHA256 webhook verification.

### Changed
- Added `'adyen' | 'mercadopago' | 'razorpay'` to `Provider` union (additive, not breaking).

## [0.4.0] - 2026-05-04

### Added
- **Router events** — `PayBridgeRouter.events` and `CryptoRampRouter.events` are now public `EventEmitter` instances emitting structured `RouterEvent` objects. Event types: `attempt.start | attempt.success | attempt.failure | attempt.rate_limited | attempt.timeout | circuit.opened | circuit.half_opened | circuit.closed | webhook.duplicate | request.success | request.failure`. Wildcard listener via `events.on('*', ...)`. Zero overhead when no listeners attached.
- **Payment ledger** — pluggable `LedgerStore` interface for persisting every attempt + outcome. `InMemoryLedgerStore` (FIFO, configurable `maxSize`) and `createRedisLedgerStore` adapter. Optional `ledger` config on both routers; ledger failures are non-fatal (swallowed + emitted as event). `LedgerEntry` includes timestamp, provider, operation, status, reference, durationMs, errorCode, errorMessage.
- **Tracer interface** — `TracerLike` and `SpanLike` types for OpenTelemetry-compatible distributed tracing. Optional `tracer` config on both routers; defaults to `noopTracer` (zero overhead). Plug `@opentelemetry/api` directly:
  ```ts
  import { trace } from '@opentelemetry/api';
  new PayBridgeRouter({ providers, tracer: trace.getTracer('paybridge') });
  ```
  Spans are emitted per attempt with `paybridge.provider`, `paybridge.strategy`, `paybridge.attempt`, `paybridge.payment.id`, `paybridge.payment.status`, `paybridge.error.code` attributes.

### Changed
- Circuit breaker now emits `opened`, `half_opened`, `closed` events on state transitions (accessible via `breaker.events`). PayBridgeRouter and CryptoRampRouter subscribe to these and re-emit as `circuit.*` router events.

## [0.3.1] - 2026-05-03

### Added
- **`STABILITY.md`** — public-API stability policy + 1.0.0 release gates. Lists what 1.0 will lock and what stays internal.
- **`SETUP.md`** — maintainer one-time setup checklist (NPM_TOKEN secret, branch protection, npm 2FA, etc.).
- **`tests/e2e/sandbox-validate.ts`** — runnable harness that exercises every fiat provider's `createPayment` against its real sandbox if env vars are set, else skips. R1/$1 amounts only, no real charges. Run with `npm run test:e2e:sandbox`.
- **`docs/announcements/v0.3.0.md`** — Twitter / LinkedIn / Discord / HN drafts.
- `tsx` added to devDependencies (was missing despite scripts referencing it).

### Changed
- **`SECURITY.md`** — replaced placeholder email with GitHub Security Advisories link. Added Scope (in/out) section. No email maintenance burden.
- README sandbox-testing note now references `npm run test:e2e:sandbox`.

## [0.3.0] - 2026-05-03

### BREAKING
- **`PayBridgeRouter.parseWebhook` is now async** (returns `Promise<WebhookEvent>`, was `WebhookEvent`). Required for the new idempotency store's async dedup check. Callers must `await` the result. `PayBridge.parseWebhook` (single-provider class) is unchanged. See `docs/migration.md` for upgrade snippets. Pre-1.0 minor allowed under semver `0.x.y` initial-development clause.

### Added
- **Webhook idempotency store** — prevents duplicate webhook processing. `InMemoryIdempotencyStore` for single-instance deployments, `createRedisIdempotencyStore` for multi-instance (shares state via Redis). Optional `idempotencyStore` config on `PayBridgeRouter`. When enabled, `parseWebhook` deduplicates by event ID and throws `WebhookDuplicateError` on duplicates. Default 24h TTL. Opt-in (backwards-compatible).
- **Crypto router `fastest` strategy** — `CryptoRampRouter` now supports `strategy: 'fastest'` (sorts providers by `avgLatencyMs`, ascending). Providers with `null`/`undefined` latency sort last.
- **Migration guide** — comprehensive upgrade guide at `docs/migration.md` covering 0.1 → 0.2 and 0.2 → 0.3 breaking changes, new features, and code examples.
- **Multi-provider example** — `examples/multi-provider.ts` demonstrates `PayBridgeRouter` with 4 SA providers, `cheapest` strategy, `InMemoryIdempotencyStore`, and webhook idempotency handling. Runnable TypeScript example with expected output comments.

### Changed
- `PayBridgeRouter.parseWebhook` is now `async` and returns `Promise<WebhookEvent>` (was synchronous). Required for idempotency store async lookups. Callers must `await` the result.
- Fiat `fastest` strategy now sorts providers with `null`/`undefined` `avgLatencyMs` last (was defaulting to 1000ms). More predictable behavior when latency data is incomplete.

## [0.2.3] - 2026-05-03

### Added
- **GitHub Actions CI** — `.github/workflows/test.yml` runs typecheck + 227 tests on Node 18, 20, 22 against every push to `master` and every PR.
- **Manual publish workflow** — `.github/workflows/publish.yml` publishes to npm on tag push (`v*.*.*`) or manual dispatch. Requires `NPM_TOKEN` repo secret.
- **`SECURITY.md`** — vulnerability disclosure policy, supported versions, 90-day responsible disclosure window.
- **`CONTRIBUTING.md`** — local setup, e2e harness instructions, provider-implementation checklist (extend base, getCapabilities, fetch-mock tests, factory wiring, README + CHANGELOG entries), code style rules.
- **Issue + PR templates** — `bug_report.yml` (provider dropdown, version, sandbox/live, reproduction), `feature_request.yml`, `config.yml` (links to security advisories + Discord), `PULL_REQUEST_TEMPLATE.md`.
- **`prepack` script** — runs `clean && build` so `npm pack` produces the same lean tarball as `npm publish`.

### Tests
- **+56 unit tests** (171 → 227, +33% coverage). All providers gained:
  - Refund happy paths (full, partial, with-reason) for Stripe / Yoco / PayStack / PayFast / Flutterwave / Peach.
  - "Refund unsupported by spec" coverage for Ozow (3 tests confirming clean throw).
  - 4xx / 5xx HTTP error path tests for all 8 fiat + 2 crypto providers.
  - `FetchTimeoutError` propagation tests.
  - HTTP 429 surfacing as `HttpError`.
  - Webhook replay-window boundary edges (Stripe 299s pass / 301s reject, Yoco Svix 299s/301s).
  - Documented "no replay protection" tests for PayStack + Flutterwave (provider spec limitation).
  - `Idempotency-Key` uniqueness tests for Yoco.
  - Currency validation edge cases (unsupported, lowercase).

## [0.2.2] - 2026-05-03

### Added
- **`timedFetch` / `timedFetchOrThrow` / `FetchTimeoutError` / `HttpError`** exported from `paybridge`. Default 30s timeout on all internal HTTP calls. Provider hang no longer hangs the SDK. Custom providers can use the same helpers.
- **Rate-limit awareness in `PayBridgeRouter`** — 429 and 503-with-`Retry-After` responses now skip to the next provider WITHOUT recording a circuit-breaker failure. Reasoning: rate-limiting is provider load, not provider failure. Prevents one busy provider from being marked broken and shut out of routing.
- `errorCode` field on `RoutingAttempt` (e.g. `'RATE_LIMITED'`, `'TIMEOUT'`) for downstream observability.

### Fixed
- **MoonPay off-ramp quote** — was calling on-ramp `/v3/currencies/{code}/quote`. Now correctly calls `/v3/currencies/{code}/sell_quote` and swaps `baseCurrencyCode`/`quoteCurrencyCode` for sell direction.

### Changed
- All provider HTTP calls now go through `timedFetch` (or `timedFetchOrThrow` where the provider previously threw on non-2xx). Default 30s timeout. Override per-call via `timeoutMs` if needed.

## [0.2.1] - 2026-05-03

### Fixed
- **Factory wiring restored** — `case 'stripe' | 'payfast' | 'paystack' | 'peach' | 'flutterwave':` were throwing `not yet implemented` despite the provider classes being fully built and tested. Lost during a mid-development rebase. All 8 fiat providers now reachable via `new PayBridge({ provider: '...' })`. Crypto exports (`./crypto`) also restored.

### Changed
- **README provider matrix** — replaced "Coming soon" / "Planned" rows with accurate Production status for the 7 providers shipped in 0.2.0. Added Flutterwave (was missing). Added Crypto provider matrix. Marked Yoco/Ozow/Peach features that throw cleanly per upstream API limits with `⛔` instead of misleading checkmarks. Added "Sandbox testing" note for the 5 providers that are wired and unit-tested but not yet validated against live credentials.

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
