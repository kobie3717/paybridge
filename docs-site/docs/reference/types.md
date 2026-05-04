# Type Reference

PayBridge is TypeScript-first with full type safety.

## Core types

### `PayBridgeConfig`

```typescript
interface PayBridgeConfig {
  provider: Provider;
  credentials: ProviderCredentials;
  sandbox?: boolean;
  webhookSecret?: string;
}

type Provider =
  | 'softycomp'
  | 'yoco'
  | 'ozow'
  | 'payfast'
  | 'paystack'
  | 'stripe'
  | 'peach'
  | 'flutterwave'
  | 'adyen'
  | 'mercadopago'
  | 'razorpay'
  | 'mollie'
  | 'square'
  | 'pesapal';
```

### `CreatePaymentParams`

```typescript
interface CreatePaymentParams {
  amount: number;             // Major currency unit (rands, dollars)
  currency: string;           // ISO 4217 (ZAR, USD, EUR, etc.)
  reference: string;          // Your internal reference
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  urls: {
    success: string;          // Redirect on success
    cancel: string;           // Redirect on cancel
    webhook: string;          // Webhook notification URL
  };
  metadata?: Record<string, any>;
}
```

### `PaymentResult`

```typescript
interface PaymentResult {
  id: string;                 // Provider payment ID
  status: PaymentStatus;
  amount: number;
  currency: string;
  reference: string;
  checkoutUrl: string;        // Redirect customer here
  provider: string;
  raw?: any;                  // Provider-specific raw response
  routingMeta?: RoutingMeta;  // Only when using router
}

type PaymentStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

### `CreateSubscriptionParams`

```typescript
interface CreateSubscriptionParams {
  amount: number;
  currency: string;
  interval: 'weekly' | 'monthly' | 'yearly';
  reference: string;
  customer: {
    name: string;
    email: string;
  };
  urls: {
    success: string;
    cancel: string;
    webhook: string;
  };
  startDate?: string;         // ISO 8601 date (future date)
  billingDay?: number;        // Day of month (1-28)
}
```

### `RefundParams`

```typescript
interface RefundParams {
  paymentId: string;
  amount?: number;            // Partial refund (omit for full)
  reason?: string;
}
```

### `WebhookEvent`

Discriminated union:

```typescript
type WebhookEvent =
  | { type: 'payment.completed'; payment: PaymentResult }
  | { type: 'payment.failed'; payment: PaymentResult }
  | { type: 'payment.cancelled'; payment: PaymentResult }
  | { type: 'refund.completed'; refund: RefundResult };
```

## Routing types

### `RouterConfig`

```typescript
interface RouterConfig {
  providers: Array<{
    provider: PayBridge;
    weight?: number;
  }>;
  strategy: 'cheapest' | 'fastest' | 'priority' | 'round-robin';
  fallback?: {
    enabled: boolean;
    maxAttempts: number;
    retryDelayMs: number;
  };
  circuitBreaker?: CircuitBreakerConfig;
  circuitBreakerStore?: CircuitBreakerStore;
  idempotencyStore?: IdempotencyStore;
  ledger?: LedgerStore;
  tracer?: TracerLike;
}
```

### `RoutingMeta`

```typescript
interface RoutingMeta {
  chosenProvider: string;
  attempts: RoutingAttempt[];
  totalDurationMs: number;
}

interface RoutingAttempt {
  provider: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}
```

## Crypto types

### `CryptoRampConfig`

```typescript
interface CryptoRampConfig {
  provider: 'moonpay' | 'yellowcard' | 'transak' | 'ramp';
  credentials: CryptoCredentials;
  sandbox?: boolean;
  webhookSecret?: string;
}
```

### `RampQuote`

```typescript
interface RampQuote {
  fiatAmount: number;
  fiatCurrency: string;
  cryptoAmount: number;
  asset: string;
  network: string;
  fee: number;
  rate: number;
}
```

## Import paths

```typescript
// Core types
import type {
  PayBridgeConfig,
  CreatePaymentParams,
  PaymentResult,
  WebhookEvent
} from 'paybridge';

// Routing types
import type {
  RouterConfig,
  RoutingMeta
} from 'paybridge';

// Crypto types
import type {
  CryptoRampConfig,
  RampQuote
} from 'paybridge/crypto';
```

## Next steps

- [Error reference](/reference/errors)
- [Examples](/examples)
