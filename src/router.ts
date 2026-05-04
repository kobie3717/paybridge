/**
 * PayBridgeRouter — Multi-provider routing with fallback
 */

import { PayBridge } from './index';
import {
  CreatePaymentParams,
  PaymentResult,
  CreateSubscriptionParams,
  SubscriptionResult,
  RefundParams,
  RefundResult,
  WebhookEvent,
  Provider,
} from './types';
import {
  RoutingStrategy,
  FallbackConfig,
  RoutingMeta,
  RoutingAttempt,
  RoutingError,
} from './routing-types';
import { ProviderWithMeta, getStrategy, StrategyContext } from './strategies';
import { CircuitBreaker } from './circuit-breaker';
import { HttpError, FetchTimeoutError } from './utils/fetch';
import type { IdempotencyStore } from './webhook-idempotency-store';
import { RouterEventEmitter } from './router-events';
import type { LedgerStore } from './ledger';
import type { TracerLike } from './tracer';
import { noopTracer } from './tracer';

function sanitizeErrorMessage(msg: string | undefined): string {
  if (!msg) return 'unknown error';
  return msg
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]')
    .replace(/(api[_-]?key|secret|token|password)["':=\s]+\S+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

export class WebhookDuplicateError extends Error {
  readonly name = 'WebhookDuplicateError';
  readonly eventId: string;
  readonly provider: string;
  constructor(provider: string, eventId: string) {
    super(`Webhook event already processed: ${provider}:${eventId}`);
    this.eventId = eventId;
    this.provider = provider;
  }
}

export interface PayBridgeRouterConfig {
  providers: Array<{
    provider: PayBridge;
    weight?: number;
    priority?: number;
  }>;
  strategy?: RoutingStrategy;
  fallback?: FallbackConfig;
  circuitBreakerStore?: import('./circuit-breaker-store').CircuitBreakerStore;
  idempotencyStore?: IdempotencyStore;
  ledger?: LedgerStore;
  tracer?: TracerLike;
}

export class PayBridgeRouter {
  readonly events = new RouterEventEmitter();
  private providers: ProviderWithMeta[];
  private strategy: RoutingStrategy;
  private fallback: FallbackConfig;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private idempotencyStore?: IdempotencyStore;
  private ledger?: LedgerStore;
  private tracer: TracerLike;
  private rrIndex = 0;
  private config: PayBridgeRouterConfig;

  constructor(config: PayBridgeRouterConfig) {
    this.config = config;
    this.providers = config.providers.map(p => ({
      instance: p.provider,
      weight: p.weight,
      priority: p.priority,
    }));
    this.strategy = config.strategy ?? 'cheapest';
    this.fallback = {
      enabled: config.fallback?.enabled ?? true,
      maxAttempts: config.fallback?.maxAttempts ?? 3,
      retryDelayMs: config.fallback?.retryDelayMs ?? 250,
    };
    this.idempotencyStore = config.idempotencyStore;
    this.ledger = config.ledger;
    this.tracer = config.tracer ?? noopTracer;
    this.circuitBreakers = new Map();

    for (const p of this.providers) {
      const name = p.instance.getProviderName();
      const breaker = new CircuitBreaker(name, {
        store: config.circuitBreakerStore,
      });
      breaker.events.on('opened', (key) => {
        this.events.emitEvent({
          type: 'circuit.opened',
          provider: key,
          timestamp: new Date().toISOString(),
        });
      });
      breaker.events.on('half_opened', (key) => {
        this.events.emitEvent({
          type: 'circuit.half_opened',
          provider: key,
          timestamp: new Date().toISOString(),
        });
      });
      breaker.events.on('closed', (key) => {
        this.events.emitEvent({
          type: 'circuit.closed',
          provider: key,
          timestamp: new Date().toISOString(),
        });
      });
      this.circuitBreakers.set(name, breaker);
    }
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Invalid amount: must be a positive finite number');
    }

    const context: StrategyContext = {
      amount: params.amount,
      currency: params.currency,
    };

    const filtered = this.filterProviders(params.currency, params.amount);
    if (filtered.length === 0) {
      throw new Error(
        `No providers support currency ${params.currency} with amount ${params.amount}`
      );
    }

    const strategyFn = getStrategy(this.strategy);
    const ordered = strategyFn(filtered, context, () => {
      const idx = this.rrIndex;
      this.rrIndex = (this.rrIndex + 1) % filtered.length;
      return idx;
    });

    const attempts: RoutingAttempt[] = [];
    let lastError: Error | null = null;

    for (const providerMeta of ordered) {
      const providerName = providerMeta.instance.getProviderName();
      const breaker = this.circuitBreakers.get(providerName);

      if (breaker && (await breaker.isOpen())) {
        attempts.push({
          provider: providerName,
          status: 'skipped',
          errorMessage: 'Circuit breaker open',
          latencyMs: 0,
        });
        continue;
      }

      const startTime = Date.now();
      const span = this.tracer.startSpan('paybridge.router.createPayment', {
        'paybridge.provider': providerName,
        'paybridge.strategy': this.strategy,
        'paybridge.attempt': attempts.length + 1,
      });
      this.events.emitEvent({
        type: 'attempt.start',
        provider: providerName,
        operation: 'createPayment',
        reference: params.reference,
        attempt: attempts.length + 1,
        timestamp: new Date().toISOString(),
      });
      try {
        const result = await providerMeta.instance.createPayment(params);
        const latencyMs = Date.now() - startTime;

        span.setAttribute('paybridge.payment.id', result.id);
        span.setAttribute('paybridge.payment.status', result.status);
        if (breaker) await breaker.recordSuccess();
        attempts.push({
          provider: providerName,
          status: 'success',
          latencyMs,
        });

        this.events.emitEvent({
          type: 'attempt.success',
          provider: providerName,
          operation: 'createPayment',
          reference: params.reference,
          durationMs: latencyMs,
          attempt: attempts.length,
          timestamp: new Date().toISOString(),
        });
        this.events.emitEvent({
          type: 'request.success',
          provider: providerName,
          operation: 'createPayment',
          reference: params.reference,
          durationMs: latencyMs,
          timestamp: new Date().toISOString(),
        });

        await this.recordLedgerEntry({
          id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          operation: 'createPayment',
          provider: providerName,
          reference: params.reference,
          providerId: result.id,
          status: 'success',
          amount: params.amount,
          currency: params.currency,
          durationMs: latencyMs,
        });

        const routingMeta: RoutingMeta = {
          attempts,
          chosenProvider: providerName,
          strategy: this.strategy,
        };

        span.end();
        return {
          ...result,
          routingMeta,
        };
      } catch (error: any) {
        span.recordException?.(error instanceof Error ? error : new Error(String(error)));
        const latencyMs = Date.now() - startTime;
        lastError = error;

        const isRateLimited = error instanceof HttpError &&
          (error.status === 429 || (error.status === 503 && error.retryAfterMs !== undefined));

        let errorCode = error.code;
        if (error instanceof FetchTimeoutError) {
          errorCode = 'TIMEOUT';
        } else if (isRateLimited) {
          errorCode = 'RATE_LIMITED';
        }

        if (isRateLimited) {
          attempts.push({
            provider: providerName,
            status: 'failed',
            errorCode: 'RATE_LIMITED',
            errorMessage: sanitizeErrorMessage(error.message),
            latencyMs,
          });
          this.events.emitEvent({
            type: 'attempt.rate_limited',
            provider: providerName,
            operation: 'createPayment',
            reference: params.reference,
            durationMs: latencyMs,
            errorCode: 'RATE_LIMITED',
            errorMessage: sanitizeErrorMessage(error.message),
            attempt: attempts.length,
            timestamp: new Date().toISOString(),
          });
          await this.recordLedgerEntry({
            id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            operation: 'createPayment',
            provider: providerName,
            reference: params.reference,
            status: 'rate_limited',
            amount: params.amount,
            currency: params.currency,
            durationMs: latencyMs,
            errorCode: 'RATE_LIMITED',
            errorMessage: sanitizeErrorMessage(error.message),
          });
        } else {
          if (breaker) await breaker.recordFailure();

          attempts.push({
            provider: providerName,
            status: 'failed',
            errorCode,
            errorMessage: sanitizeErrorMessage(error.message),
            latencyMs,
          });
          const eventType = error instanceof FetchTimeoutError ? 'attempt.timeout' : 'attempt.failure';
          this.events.emitEvent({
            type: eventType,
            provider: providerName,
            operation: 'createPayment',
            reference: params.reference,
            durationMs: latencyMs,
            errorCode,
            errorMessage: sanitizeErrorMessage(error.message),
            attempt: attempts.length,
            timestamp: new Date().toISOString(),
          });
          const ledgerStatus = error instanceof FetchTimeoutError ? 'timeout' : 'failed';
          await this.recordLedgerEntry({
            id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            operation: 'createPayment',
            provider: providerName,
            reference: params.reference,
            status: ledgerStatus,
            amount: params.amount,
            currency: params.currency,
            durationMs: latencyMs,
            errorCode,
            errorMessage: sanitizeErrorMessage(error.message),
          });
        }

        span.setAttribute('paybridge.error.code', errorCode ?? 'unknown');
        span.end();

        if (!this.fallback.enabled || attempts.length >= (this.fallback.maxAttempts ?? 3)) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs ?? 250);
      }
    }

    this.events.emitEvent({
      type: 'request.failure',
      operation: 'createPayment',
      reference: params.reference,
      errorMessage: lastError?.message || 'All providers failed',
      timestamp: new Date().toISOString(),
    });
    throw new RoutingError(
      `All providers failed: ${lastError?.message || 'Unknown error'}`,
      attempts
    );
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    const context: StrategyContext = {
      amount: params.amount,
      currency: params.currency,
    };

    const filtered = this.filterProviders(params.currency, params.amount);
    if (filtered.length === 0) {
      throw new Error(
        `No providers support currency ${params.currency} with amount ${params.amount}`
      );
    }

    const strategyFn = getStrategy(this.strategy);
    const ordered = strategyFn(filtered, context, () => {
      const idx = this.rrIndex;
      this.rrIndex = (this.rrIndex + 1) % filtered.length;
      return idx;
    });

    const attempts: RoutingAttempt[] = [];
    let lastError: Error | null = null;

    for (const providerMeta of ordered) {
      const providerName = providerMeta.instance.getProviderName();
      const breaker = this.circuitBreakers.get(providerName);

      if (breaker && (await breaker.isOpen())) {
        attempts.push({
          provider: providerName,
          status: 'skipped',
          errorMessage: 'Circuit breaker open',
          latencyMs: 0,
        });
        continue;
      }

      const startTime = Date.now();
      this.events.emitEvent({
        type: 'attempt.start',
        provider: providerName,
        operation: 'createSubscription',
        reference: params.reference,
        attempt: attempts.length + 1,
        timestamp: new Date().toISOString(),
      });
      try {
        const result = await providerMeta.instance.createSubscription(params);
        const latencyMs = Date.now() - startTime;

        if (breaker) await breaker.recordSuccess();
        attempts.push({
          provider: providerName,
          status: 'success',
          latencyMs,
        });

        this.events.emitEvent({
          type: 'attempt.success',
          provider: providerName,
          operation: 'createSubscription',
          reference: params.reference,
          durationMs: latencyMs,
          attempt: attempts.length,
          timestamp: new Date().toISOString(),
        });
        this.events.emitEvent({
          type: 'request.success',
          provider: providerName,
          operation: 'createSubscription',
          reference: params.reference,
          durationMs: latencyMs,
          timestamp: new Date().toISOString(),
        });

        await this.recordLedgerEntry({
          id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          operation: 'createSubscription',
          provider: providerName,
          reference: params.reference,
          providerId: result.id,
          status: 'success',
          amount: params.amount,
          currency: params.currency,
          durationMs: latencyMs,
        });

        return result;
      } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        lastError = error;

        const isRateLimited = error instanceof HttpError &&
          (error.status === 429 || (error.status === 503 && error.retryAfterMs !== undefined));

        if (isRateLimited) {
          attempts.push({
            provider: providerName,
            status: 'failed',
            errorCode: 'RATE_LIMITED',
            errorMessage: sanitizeErrorMessage(error.message),
            latencyMs,
          });
          this.events.emitEvent({
            type: 'attempt.rate_limited',
            provider: providerName,
            operation: 'createSubscription',
            reference: params.reference,
            durationMs: latencyMs,
            errorCode: 'RATE_LIMITED',
            errorMessage: sanitizeErrorMessage(error.message),
            attempt: attempts.length,
            timestamp: new Date().toISOString(),
          });
          await this.recordLedgerEntry({
            id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            operation: 'createSubscription',
            provider: providerName,
            reference: params.reference,
            status: 'rate_limited',
            amount: params.amount,
            currency: params.currency,
            durationMs: latencyMs,
            errorCode: 'RATE_LIMITED',
            errorMessage: sanitizeErrorMessage(error.message),
          });
        } else {
          if (breaker) await breaker.recordFailure();

          let errorCode = error.code;
          if (error instanceof FetchTimeoutError) {
            errorCode = 'TIMEOUT';
          }

          attempts.push({
            provider: providerName,
            status: 'failed',
            errorCode,
            errorMessage: sanitizeErrorMessage(error.message),
            latencyMs,
          });
          const eventType = error instanceof FetchTimeoutError ? 'attempt.timeout' : 'attempt.failure';
          this.events.emitEvent({
            type: eventType,
            provider: providerName,
            operation: 'createSubscription',
            reference: params.reference,
            durationMs: latencyMs,
            errorCode,
            errorMessage: sanitizeErrorMessage(error.message),
            attempt: attempts.length,
            timestamp: new Date().toISOString(),
          });
          const ledgerStatus = error instanceof FetchTimeoutError ? 'timeout' : 'failed';
          await this.recordLedgerEntry({
            id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            operation: 'createSubscription',
            provider: providerName,
            reference: params.reference,
            status: ledgerStatus,
            amount: params.amount,
            currency: params.currency,
            durationMs: latencyMs,
            errorCode,
            errorMessage: sanitizeErrorMessage(error.message),
          });
        }

        if (!this.fallback.enabled || attempts.length >= (this.fallback.maxAttempts ?? 3)) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs ?? 250);
      }
    }

    this.events.emitEvent({
      type: 'request.failure',
      operation: 'createSubscription',
      reference: params.reference,
      errorMessage: lastError?.message || 'All providers failed',
      timestamp: new Date().toISOString(),
    });
    throw new RoutingError(
      `All providers failed for subscription: ${lastError?.message || 'Unknown error'}`,
      attempts
    );
  }

  async getPayment(id: string, provider?: string): Promise<PaymentResult> {
    if (provider) {
      const providerMeta = this.providers.find(
        p => p.instance.getProviderName() === provider
      );
      if (!providerMeta) {
        throw new Error(`Provider ${provider} not found in router`);
      }
      return providerMeta.instance.getPayment(id);
    }

    let lastError: Error | null = null;
    for (const providerMeta of this.providers) {
      try {
        return await providerMeta.instance.getPayment(id);
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new Error(
      `Payment ${id} not found in any provider: ${lastError?.message || 'Unknown error'}`
    );
  }

  async refund(params: RefundParams, provider?: string): Promise<RefundResult> {
    if (provider) {
      const providerMeta = this.providers.find(
        p => p.instance.getProviderName() === provider
      );
      if (!providerMeta) {
        throw new Error(`Provider ${provider} not found in router`);
      }
      return providerMeta.instance.refund(params);
    }

    let lastError: Error | null = null;
    for (const providerMeta of this.providers) {
      try {
        return await providerMeta.instance.refund(params);
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new Error(
      `Refund for payment ${params.paymentId} failed on all providers: ${lastError?.message || 'Unknown error'}`
    );
  }

  async parseWebhook(body: any, headers: any, providerName: Provider): Promise<WebhookEvent> {
    const providerMeta = this.providers.find(
      p => p.instance.getProviderName() === providerName
    );
    if (!providerMeta) {
      throw new Error(`Unknown provider for webhook: ${providerName}`);
    }
    const event = providerMeta.instance.parseWebhook(body, headers);

    if (this.idempotencyStore) {
      const eventId = event.payment?.id || event.subscription?.id || event.refund?.id;
      if (eventId) {
        const key = `${providerName}:${eventId}`;
        const ttlMs = 24 * 60 * 60 * 1000;
        const isNew = await this.idempotencyStore.recordIfNew(key, ttlMs);
        if (!isNew) {
          this.events.emitEvent({
            type: 'webhook.duplicate',
            provider: providerName,
            operation: 'parseWebhook',
            reference: eventId,
            timestamp: new Date().toISOString(),
          });
          throw new WebhookDuplicateError(providerName, eventId);
        }
      }
    }

    return event;
  }

  verifyWebhook(body: any, headers: any, providerName: Provider): boolean {
    const providerMeta = this.providers.find(
      p => p.instance.getProviderName() === providerName
    );
    if (!providerMeta) {
      throw new Error(`Unknown provider for webhook: ${providerName}`);
    }
    return providerMeta.instance.verifyWebhook(body, headers);
  }

  private filterProviders(currency: string, amount: number): ProviderWithMeta[] {
    return this.providers.filter(p => {
      const caps = p.instance.provider.getCapabilities();

      if (!caps.currencies.includes(currency)) {
        return false;
      }

      if (caps.minAmount !== undefined && amount < caps.minAmount) {
        return false;
      }

      if (caps.maxAmount !== undefined && amount > caps.maxAmount) {
        return false;
      }

      return true;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async recordLedgerEntry(entry: import('./ledger').LedgerEntry): Promise<void> {
    if (!this.ledger) return;
    try {
      await this.ledger.append(entry);
    } catch (err) {
      this.events.emitEvent({
        type: 'attempt.failure',
        operation: entry.operation as any,
        provider: entry.provider,
        errorMessage: 'Ledger write failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
