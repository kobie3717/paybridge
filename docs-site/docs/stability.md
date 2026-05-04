# Stability Policy

This document defines PayBridge's API stability guarantees and the path to 1.0.

## Current Status

**We are pre-1.0.0.** Under [Semantic Versioning 2.0.0](https://semver.org/) initial-development rules, `0.x.y` versions allow breaking changes in minor releases.

**Current stable line**: `0.8.x`

Post-1.0, breaking changes will require a major version bump.

## Path to 1.0.0

The following gates must clear before 1.0.0 ships:

1. **Live sandbox validation for all fiat providers**
2. **Yellow Card: real spec confirmation OR removal**
3. **PayFast Query API + refund endpoints sandbox-validated**
4. **MoonPay `sell_quote` endpoint live-verified**
5. **Zero `TODO(verify)` markers in `src/`**
6. **30 days of no API breakage on `master`**
7. **At least one external production user**
8. **Migration guide complete for each minor**

**1.0.0 Target**: Q3 2026

## Public API Surface (1.0 Guarantees)

Once 1.0.0 ships, the following APIs are locked:

### Core Classes

- `PayBridge` class shape
- `PayBridgeRouter` class shape
- `CryptoRamp` class shape
- `CryptoRampRouter` class shape

### Types

- `Provider` literal union
- `WebhookEvent` discriminated union
- `PaymentResult`, `SubscriptionResult`, `RefundResult` interfaces
- `CreatePaymentParams`, `CreateSubscriptionParams`, `RefundParams` interfaces
- `ProviderCapabilities`, `RoutingMeta`, `RampQuote` interfaces
- `IdempotencyStore` interface

### Errors

- `RoutingError`
- `WebhookDuplicateError`
- `FetchTimeoutError`
- `HttpError`

### Utilities

- `timedFetch` / `timedFetchOrThrow`
- `createRedisCircuitBreakerStore`
- `createRedisIdempotencyStore`
- Currency helpers

## Explicitly NOT Public

The following may change without notice:

- `dist/` JavaScript files (use TypeScript imports)
- Internal helpers beyond documented exports
- Provider-specific `result.raw` fields
- Test files
- Private methods
- Circuit-breaker internal state schema

## Deprecation Policy (Post-1.0)

Starting with 1.0.0:

1. **Breaking changes only on major versions**
2. **Deprecations marked with `@deprecated` JSDoc + runtime warning**
3. **Breaking changes get migration guide entries**

## Versioning Rules

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **Patch (0.3.1)**: Bug fixes, no API changes
- **Minor (0.4.0)**: New features, additive changes
- **Major (1.0.0, 2.0.0)**: Breaking changes

**Pre-1.0 exception**: `0.x.y` allows breaking changes in minor releases.

## Experimental Features

Features marked `@experimental` are excluded from stability guarantees:

- Yellow Card crypto provider

## Support Policy

- **Latest minor** receives bug fixes and security patches
- **Previous minor** receives security patches for 90 days
- **Older versions** are unsupported

Post-1.0:
- **Latest major** receives bug fixes, features, and security patches
- **Previous major** receives security patches for 6 months

## Questions?

- [Discord](https://discord.gg/Y2jCXNGgE)
- [GitHub Issues](https://github.com/kobie3717/paybridge/issues)
- [Security Policy](https://github.com/kobie3717/paybridge/security)
