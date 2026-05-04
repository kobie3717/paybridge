# Error Reference

PayBridge throws structured errors for different failure scenarios.

## Error types

### `RoutingError`

Thrown when all providers fail (after exhausting fallback attempts).

```typescript
class RoutingError extends Error {
  name: 'RoutingError';
  message: string;
  attempts: RoutingAttempt[];
}
```

Example:

```typescript
try {
  const payment = await router.createPayment({ ... });
} catch (error) {
  if (error instanceof RoutingError) {
    console.log('All providers failed');
    console.log('Attempts:', error.attempts);
    // [
    //   { provider: 'stripe', success: false, errorCode: 'TIMEOUT' },
    //   { provider: 'yoco', success: false, errorCode: 'INVALID_CREDENTIALS' }
    // ]
  }
}
```

### `WebhookDuplicateError`

Thrown when idempotency store detects a duplicate webhook event.

```typescript
class WebhookDuplicateError extends Error {
  name: 'WebhookDuplicateError';
  message: string;
  eventId: string;
}
```

Example:

```typescript
import { WebhookDuplicateError } from 'paybridge';

try {
  const event = await router.parseWebhook(req.body, req.headers, 'stripe');
  // Process event...
} catch (error) {
  if (error instanceof WebhookDuplicateError) {
    console.log('Duplicate webhook, already processed');
    return res.sendStatus(200);  // Stop retries
  }
  throw error;
}
```

### `FetchTimeoutError`

Thrown when an HTTP request exceeds the timeout (default 30s).

```typescript
class FetchTimeoutError extends Error {
  name: 'FetchTimeoutError';
  message: string;
  timeoutMs: number;
  url: string;
}
```

Example:

```typescript
try {
  const payment = await pay.createPayment({ ... });
} catch (error) {
  if (error instanceof FetchTimeoutError) {
    console.log(`Request to ${error.url} timed out after ${error.timeoutMs}ms`);
  }
}
```

### `HttpError`

Thrown on non-2xx HTTP responses.

```typescript
class HttpError extends Error {
  name: 'HttpError';
  message: string;
  status: number;             // HTTP status code
  statusText: string;         // HTTP status text
  body?: any;                 // Response body (if parseable)
  url: string;
}
```

Example:

```typescript
try {
  const payment = await pay.createPayment({ ... });
} catch (error) {
  if (error instanceof HttpError) {
    console.log(`HTTP ${error.status} ${error.statusText}`);
    console.log('Response:', error.body);
    
    if (error.status === 401) {
      // Invalid credentials
    } else if (error.status === 429) {
      // Rate limited
    }
  }
}
```

## Provider-specific errors

Some providers throw clear errors for unsupported features:

```typescript
// Yoco doesn't support subscriptions
try {
  await yoco.createSubscription({ ... });
} catch (error) {
  console.log(error.message);
  // "Yoco does not support subscriptions via the Online Payments API"
}

// Ozow doesn't support refunds
try {
  await ozow.refund({ paymentId: 'pay_123' });
} catch (error) {
  console.log(error.message);
  // "Ozow does not support programmatic refunds"
}
```

## Error handling best practices

1. **Catch specific errors first**:

```typescript
try {
  const payment = await router.createPayment({ ... });
} catch (error) {
  if (error instanceof WebhookDuplicateError) {
    // Handle duplicate
  } else if (error instanceof RoutingError) {
    // Handle routing failure
  } else if (error instanceof FetchTimeoutError) {
    // Handle timeout
  } else {
    // Generic error
  }
}
```

2. **Log routing attempts**:

```typescript
catch (error) {
  if (error instanceof RoutingError) {
    logger.error('All providers failed', {
      attempts: error.attempts,
      providers: error.attempts.map(a => a.provider),
      errors: error.attempts.map(a => a.errorCode)
    });
  }
}
```

3. **Return 200 OK for duplicate webhooks**:

```typescript
catch (error) {
  if (error instanceof WebhookDuplicateError) {
    return res.sendStatus(200);  // Stop provider retries
  }
  throw error;
}
```

## Next steps

- [Type reference](/reference/types)
- [Webhook idempotency](/webhooks/idempotency)
- [Routing overview](/routing/overview)
