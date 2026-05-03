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
}

export class PayBridgeRouter {
  private providers: ProviderWithMeta[];
  private strategy: RoutingStrategy;
  private fallback: FallbackConfig;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private idempotencyStore?: IdempotencyStore;
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
    this.circuitBreakers = new Map();

    for (const p of this.providers) {
      const name = p.instance.getProviderName();
      this.circuitBreakers.set(
        name,
        new CircuitBreaker(name, {
          store: config.circuitBreakerStore,
        })
      );
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
      try {
        const result = await providerMeta.instance.createPayment(params);
        const latencyMs = Date.now() - startTime;

        if (breaker) await breaker.recordSuccess();
        attempts.push({
          provider: providerName,
          status: 'success',
          latencyMs,
        });

        const routingMeta: RoutingMeta = {
          attempts,
          chosenProvider: providerName,
          strategy: this.strategy,
        };

        return {
          ...result,
          routingMeta,
        };
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
        }

        if (!this.fallback.enabled || attempts.length >= (this.fallback.maxAttempts ?? 3)) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs ?? 250);
      }
    }

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
      try {
        const result = await providerMeta.instance.createSubscription(params);
        const latencyMs = Date.now() - startTime;

        if (breaker) await breaker.recordSuccess();
        attempts.push({
          provider: providerName,
          status: 'success',
          latencyMs,
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
        }

        if (!this.fallback.enabled || attempts.length >= (this.fallback.maxAttempts ?? 3)) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs ?? 250);
      }
    }

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
}
