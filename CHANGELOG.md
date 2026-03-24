# Changelog

All notable changes to PayBridge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Yoco provider implementation (API calls)
- Ozow provider implementation (API calls)
- PayFast provider
- PayStack provider (Nigeria)
- Stripe provider (international)
- Peach Payments provider
- Test suite with Jest
- CI/CD pipeline with GitHub Actions
- npm package publication

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
