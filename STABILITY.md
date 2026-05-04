# API Stability Policy

This document defines PayBridge's API stability guarantees, versioning policy, and the path to 1.0.0.

## Current Status

**We are pre-1.0.0.** Under [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) initial-development rules, `0.x.y` versions allow breaking changes in minor releases. We minimize these and document them loudly in `CHANGELOG.md` and `docs/migration.md`.

**Current stable line:** `0.3.x`

Breaking changes since 0.1.0:
- **0.2.0** → `PaymentResult.routingMeta?` added, `verifyWebhook`/`parseWebhook` on `PayBridgeRouter` now require `provider` argument, circuit-breaker state in-memory only.
- **0.3.0** → `PayBridgeRouter.parseWebhook` is now `async` (returns `Promise<WebhookEvent>`).

Post-1.0, breaking changes will require a major version bump.

## Path to 1.0.0

The following gates must clear before 1.0.0 ships:

1. **Live sandbox validation for all 8 fiat providers**  
   Currently only SoftyComp and MoonPay are verified end-to-end against real sandbox credentials. Stripe, PayFast, PayStack, Yoco, Ozow, Peach, and Flutterwave are unit-tested but not live-validated. Run `npm run test:e2e:sandbox` with provider credentials to validate each.

2. **Yellow Card: real spec confirmation OR removal**  
   Yellow Card is marked `@experimental` because no public API spec exists. Before 1.0, either:
   - Obtain partner-confirmed API documentation and validate against live sandbox
   - Remove from default exports and gate behind `@experimental` imports only

3. **PayFast Query API + refund endpoints sandbox-validated**  
   PayFast `createPayment` and `parseWebhook` are wired, but the Query API (status lookup) and refund endpoints need live sandbox validation.

4. **MoonPay `sell_quote` endpoint live-verified**  
   Off-ramp quote logic is spec-compliant but not yet validated against live sandbox.

5. **Zero `TODO(verify)` markers in `src/`**  
   Grep the codebase: `grep -r 'TODO(verify)' src/`. All markers must be resolved or have tickets filed.

6. **30 days of no API breakage on `master`**  
   A cool-down period where no breaking changes land. Confirms the public API surface is stable.

7. **At least one external production user**  
   Someone (paying customer or open-source user) must be running PayBridge in production and confirm the public API meets their needs. Smoke test of real-world usage.

8. **Migration guide complete for each minor**  
   Every breaking change from 0.1.0 to 1.0.0 must have dated migration snippets in `docs/migration.md`.

## Public API Surface (1.0 Guarantees)

Once 1.0.0 ships, the following APIs are locked and will not break until a major version bump:

### Core Classes
- `PayBridge` class shape (constructor, all public methods)
- `PayBridgeRouter` class shape (constructor, strategies, fallback config)
- `CryptoRamp` class shape (on/off-ramp orchestrator)
- `CryptoRampRouter` class shape (crypto routing strategies)

### Types
- `Provider` literal union (`'softycomp' | 'yoco' | 'ozow' | ...`)
- `WebhookEvent` discriminated union (`'payment.completed' | 'payment.failed' | ...`)
- `PaymentResult`, `SubscriptionResult`, `RefundResult` interfaces
- `CreatePaymentParams`, `CreateSubscriptionParams`, `RefundParams` interfaces
- `ProviderCapabilities`, `RoutingMeta`, `RampQuote`, `RampResult` interfaces
- `IdempotencyStore` interface

### Errors
- `RoutingError` (thrown when all providers fail)
- `WebhookDuplicateError` (thrown on idempotency store duplicate)
- `FetchTimeoutError` (thrown on HTTP timeout)
- `HttpError` (thrown on non-2xx HTTP responses)

### Utilities (Exported)
- `timedFetch` / `timedFetchOrThrow` (HTTP helpers with timeout)
- `createRedisCircuitBreakerStore` (Redis circuit-breaker adapter)
- `createRedisIdempotencyStore` (Redis idempotency adapter)
- Currency helpers (`convertToMinorUnit`, `convertToMajorUnit`, `formatCurrency`)

### Explicitly NOT Public (May Break in Patches)

The following are internal implementation details and may change without notice:

- **`dist/` JavaScript files** — consumed via TypeScript; never import by file path
- **Internal helpers in `src/utils/`** beyond the documented exports above
- **Provider-specific request/response shapes** accessible via `result.raw` field  
  These reflect upstream API changes and are subject to provider versioning, not ours.
- **Test files** (`tests/**`, `dist-test/**`)
- **Private methods** on provider classes (e.g., `signWidgetUrl`, `generateSignature`)
- **Circuit-breaker internal state schema** (Redis key structure, TTL values)
- **Idempotency store internal state schema**

## Deprecation Policy (Post-1.0)

Starting with 1.0.0:

1. **Breaking changes only on major versions**  
   Patch: bug fix, no API change  
   Minor: additive features, no API break  
   Major: any API break

2. **Deprecations marked with `@deprecated` JSDoc + runtime warning**  
   Deprecated APIs will warn with `console.warn` (once per process) for at least one minor release cycle before removal in the next major.

   Example:
   ```typescript
   /**
    * @deprecated Use `createPayment()` instead. Will be removed in 2.0.0.
    */
   async makePayment(params: CreatePaymentParams): Promise<PaymentResult> {
     console.warn('[PayBridge] makePayment() is deprecated. Use createPayment() instead.');
     return this.createPayment(params);
   }
   ```

3. **Breaking changes get migration guide entries**  
   Every breaking change will have a dated migration snippet in `docs/migration.md` with before/after code examples.

## Versioning Rules

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **Patch (0.3.1)** — Bug fixes, no API changes, no new features  
  Safe to upgrade without code changes. Examples: fix webhook signature verification, fix amount conversion.

- **Minor (0.4.0)** — New features, additive API changes, no breaks  
  Safe to upgrade; new capabilities available but existing code works unchanged.  
  Examples: add new provider, add new routing strategy, add new idempotency store.

- **Major (1.0.0, 2.0.0)** — Breaking changes  
  Requires migration. See `docs/migration.md` for upgrade path.  
  Examples: rename methods, change method signatures, remove deprecated APIs.

**Pre-1.0 exception:** Under semver initial-development rules, `0.x.y` allows breaking changes in minor releases. We document these in `CHANGELOG.md` and provide migration guides, but a major bump is not required. After 1.0, this exception ends.

## Experimental Features

Features marked `@experimental` in JSDoc or gated behind feature flags are explicitly excluded from stability guarantees:

- Yellow Card crypto provider (experimental until spec confirmed)
- Future opt-in features marked `experimental: true` in config

These may change API surface or be removed without a major version bump. Production use is discouraged. When an experimental feature stabilizes, it will be announced in a minor release.

## Support Policy

- **Latest minor** (e.g., 0.3.x) receives bug fixes and security patches.
- **Previous minor** (e.g., 0.2.x) receives security patches for 90 days post-release of new minor.
- **Older versions** are unsupported.

Post-1.0:
- **Latest major** (e.g., 1.x.x) receives bug fixes, features, and security patches.
- **Previous major** (e.g., 0.x.x) receives security patches for 6 months post-release of new major.

## Timeline Estimate

**1.0.0 Target:** Q3 2026 (assuming gate 1-8 clear by end of Q2)

Remaining work:
- Gate 1: ~4 weeks (sandbox setup + validation harness for 7 providers)
- Gate 2: ~2 weeks (Yellow Card partner contact + decision)
- Gate 3: ~1 week (PayFast Query API + refund validation)
- Gate 4: ~3 days (MoonPay sell_quote live call)
- Gate 5: ~1 week (grep audit + resolution)
- Gate 6: 30 days (automatic)
- Gate 7: depends on external adoption (parallel with above)
- Gate 8: ~1 week (migration guide polish)

Total: ~8-10 weeks of work + 30-day stabilization + external user smoke test.

## Questions?

- **Discord:** [https://discord.gg/Y2jCXNGgE](https://discord.gg/Y2jCXNGgE)
- **Issues:** [GitHub Issues](https://github.com/kobie3717/paybridge/issues)
- **Security:** See [SECURITY.md](SECURITY.md)
