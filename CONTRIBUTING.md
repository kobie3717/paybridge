# Contributing to PayBridge

Thank you for considering contributing to PayBridge! This document outlines the process for contributing and guidelines for maintaining code quality.

## Getting Started

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/kobie3717/paybridge.git
   cd paybridge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Run e2e sandbox tests** (optional)
   ```bash
   # Validate all providers against real sandboxes (requires credentials)
   npm run test:e2e:sandbox
   
   # Individual provider harnesses
   npm run test:e2e:moonpay
   npm run test:e2e:yellowcard
   ```

## Adding a New Payment Provider

PayBridge is designed to make adding new providers straightforward. Follow this checklist:

### 1. Create Provider Implementation

Create `src/providers/yourprovider.ts`:

```typescript
import { PaymentProvider } from './base';
import type { 
  PayBridgeConfig,
  CreatePaymentParams,
  PaymentResult,
  // ... other types
} from '../types';

export class YourProviderProvider extends PaymentProvider {
  constructor(config: PayBridgeConfig) {
    super(config);
    // Provider-specific initialization
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    // Implementation
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    // Implementation or throw if unsupported
  }

  async getPayment(id: string): Promise<PaymentResult> {
    // Implementation
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    // Implementation or throw if unsupported
  }

  parseWebhook(body: any, headers?: any): WebhookEvent {
    // Implementation
  }

  verifyWebhook(body: any, headers?: any): boolean {
    // Implementation
  }

  getProviderName(): string {
    return 'yourprovider';
  }

  getCapabilities() {
    return {
      oneTimePayments: true,
      subscriptions: false, // Set based on provider capabilities
      refunds: true,
      webhooks: true,
    };
  }
}
```

### 2. Add to Factory

Update `src/index.ts` to include your provider in the factory:

```typescript
case 'yourprovider':
  return new YourProviderProvider(config);
```

### 3. Write Tests

Create `tests/providers/yourprovider.test.ts` using fetch mocks:

```typescript
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { PayBridge } from '../../src/index';

describe('YourProvider', () => {
  it('creates payment', async () => {
    // Use fetch mocking to test provider logic
  });
});
```

### 4. Update Documentation

- Add provider row to `README.md` provider matrix
- Document credential structure
- Add configuration example
- Note any provider-specific quirks

### 5. Update Changelog

Add entry to `CHANGELOG.md` under `[Unreleased]`:

```markdown
### Added
- YourProvider payment provider support
```

## Code Style & Guidelines

### General Principles

- **Clarity over cleverness:** Code should be self-documenting
- **Comments explain why, not what:** Only add comments when the reason for something is non-obvious
- **Type safety:** No `any` types on external data without justification in a comment
- **Zero new runtime dependencies:** Use native `fetch` and `node:crypto` only

### TypeScript

- Use strict TypeScript mode
- Avoid `any` types (use `unknown` if needed, then narrow)
- Prefer explicit types over inference for public APIs
- Use `interface` for public contracts, `type` for unions/intersections

### Security

- **Webhook signature verification:** Always use `crypto.timingSafeEqual()` for signature comparison (prevents timing attacks)
- **Never log secrets:** Redact credentials in error messages
- **Validate external data:** Parse and validate all provider responses

### Testing

- Test all public methods
- Mock external API calls (use native fetch mocking)
- Test error cases (invalid credentials, network failures, provider errors)
- Test webhook signature verification with valid and invalid signatures

### Commit Messages

- Use conventional commit format: `feat:`, `fix:`, `docs:`, etc.
- Keep first line under 72 characters
- Add detailed explanation in body if needed
- Reference issues: `Closes #123`

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code builds without errors (`npx tsc --noEmit`)
- [ ] All tests pass (`npm test`)
- [ ] `CHANGELOG.md` updated
- [ ] `README.md` updated (if user-facing change)
- [ ] No new runtime dependencies added
- [ ] Webhook code uses `crypto.timingSafeEqual()` for signature comparison
- [ ] No secrets in code or commit history
- [ ] Comments explain why, not what
- [ ] Type safety maintained (no unjustified `any` casts)

## Developer Certificate of Origin

By contributing to this project, you agree to the [Developer Certificate of Origin (DCO)](https://developercertificate.org/). This means you certify that you wrote the code or otherwise have the right to submit it.

To acknowledge this, add a `Co-authored-by` line to your commit message:

```
feat: add YourProvider payment provider

Co-authored-by: Your Name <your.email@example.com>
```

## Reporting Security Vulnerabilities

**Do not open public issues for security vulnerabilities.** Instead, see [SECURITY.md](SECURITY.md) for responsible disclosure process.

## Questions?

- **Discord:** [https://discord.gg/Y2jCXNGgE](https://discord.gg/Y2jCXNGgE)
- **Issues:** [GitHub Issues](https://github.com/kobie3717/paybridge/issues)

Thank you for contributing!
