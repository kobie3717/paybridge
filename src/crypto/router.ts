/**
 * CryptoRampRouter — Multi-provider crypto routing
 */

import { CryptoRamp } from './index';
import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
} from './types';
import {
  RoutingAttempt,
  RoutingError,
  RoutingMeta,
} from '../routing-types';
import { CircuitBreaker } from '../circuit-breaker';
import { RouterEventEmitter } from '../router-events';
import type { LedgerStore } from '../ledger';
import type { TracerLike } from '../tracer';
import { noopTracer } from '../tracer';

function sanitizeErrorMessage(msg: string | undefined): string {
  if (!msg) return 'unknown error';
  return msg
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]')
    .replace(/(api[_-]?key|secret|token|password)["':=\s]+\S+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

export interface CryptoRampRouterConfig {
  providers: Array<{ provider: CryptoRamp; priority?: number }>;
  strategy?: 'cheapest' | 'priority' | 'round-robin' | 'fastest';
  fallback?: { enabled: boolean; maxAttempts?: number; retryDelayMs?: number };
  allowExperimental?: boolean;
  circuitBreakerStore?: import('../circuit-breaker-store').CircuitBreakerStore;
  idempotencyStore?: import('../webhook-idempotency-store').IdempotencyStore;
  ledger?: LedgerStore;
  tracer?: TracerLike;
}

interface ProviderWithMeta {
  instance: CryptoRamp;
  priority?: number;
}

type CryptoStrategy = 'cheapest' | 'priority' | 'round-robin' | 'fastest';

export class CryptoRampRouter {
  readonly events = new RouterEventEmitter();
  private providers: ProviderWithMeta[];
  private strategy: CryptoStrategy;
  private fallback: { enabled: boolean; maxAttempts: number; retryDelayMs: number };
  private allowExperimental: boolean;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private ledger?: LedgerStore;
  private tracer: TracerLike;
  private rrIndex = 0;
  private config: CryptoRampRouterConfig;

  constructor(config: CryptoRampRouterConfig) {
    this.config = config;
    this.providers = config.providers.map(p => ({
      instance: p.provider,
      priority: p.priority,
    }));
    this.strategy = config.strategy ?? 'cheapest';
    this.fallback = {
      enabled: config.fallback?.enabled ?? true,
      maxAttempts: config.fallback?.maxAttempts ?? 3,
      retryDelayMs: config.fallback?.retryDelayMs ?? 250,
    };
    this.allowExperimental = config.allowExperimental ?? false;
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

  async getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    network: string
  ): Promise<RampQuote> {
    const filtered = this.filterProviders({ fiatCurrency, asset: cryptoAsset, network });
    if (filtered.length === 0) {
      throw new Error(
        `No providers support ${cryptoAsset} on ${network} with ${fiatCurrency}`
      );
    }

    const ordered = this.orderProviders(filtered, direction);

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
        const result = await providerMeta.instance.getQuote(
          direction,
          fiatAmount,
          fiatCurrency,
          cryptoAsset,
          network
        );
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

        if (breaker) await breaker.recordFailure();
        attempts.push({
          provider: providerName,
          status: 'failed',
          errorCode: error.code,
          errorMessage: sanitizeErrorMessage(error.message),
          latencyMs,
        });

        if (!this.fallback.enabled || attempts.length >= this.fallback.maxAttempts) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs);
      }
    }

    throw new RoutingError(
      `All providers failed: ${lastError?.message || 'Unknown error'}`,
      attempts
    );
  }

  async createOnRamp(params: OnRampParams): Promise<RampResult> {
    if (!Number.isFinite(params.fiatAmount) || params.fiatAmount <= 0) {
      throw new Error('Invalid amount: must be a positive finite number');
    }

    const filtered = this.filterProviders(params);
    if (filtered.length === 0) {
      throw new Error(
        `No providers support ${params.asset} on ${params.network} with ${params.fiatCurrency}`
      );
    }

    const ordered = this.orderProviders(filtered, 'on');

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
        operation: 'createOnRamp',
        attempt: attempts.length + 1,
        timestamp: new Date().toISOString(),
      });
      try {
        const result = await providerMeta.instance.createOnRamp(params);
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
          operation: 'createOnRamp',
          durationMs: latencyMs,
          attempt: attempts.length,
          timestamp: new Date().toISOString(),
        });
        this.events.emitEvent({
          type: 'request.success',
          provider: providerName,
          operation: 'createOnRamp',
          durationMs: latencyMs,
          timestamp: new Date().toISOString(),
        });

        await this.recordLedgerEntry({
          id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          operation: 'createOnRamp',
          provider: providerName,
          providerId: result.id,
          status: 'success',
          amount: params.fiatAmount,
          currency: params.fiatCurrency,
          durationMs: latencyMs,
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

        if (breaker) await breaker.recordFailure();
        attempts.push({
          provider: providerName,
          status: 'failed',
          errorCode: error.code,
          errorMessage: sanitizeErrorMessage(error.message),
          latencyMs,
        });

        this.events.emitEvent({
          type: 'attempt.failure',
          provider: providerName,
          operation: 'createOnRamp',
          durationMs: latencyMs,
          errorCode: error.code,
          errorMessage: sanitizeErrorMessage(error.message),
          attempt: attempts.length,
          timestamp: new Date().toISOString(),
        });

        if (!this.fallback.enabled || attempts.length >= this.fallback.maxAttempts) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs);
      }
    }

    this.events.emitEvent({
      type: 'request.failure',
      operation: 'createOnRamp',
      errorMessage: lastError?.message || 'All providers failed',
      timestamp: new Date().toISOString(),
    });
    throw new RoutingError(
      `All providers failed: ${lastError?.message || 'Unknown error'}`,
      attempts
    );
  }

  async createOffRamp(params: OffRampParams): Promise<RampResult> {
    if (!Number.isFinite(params.cryptoAmount) || params.cryptoAmount <= 0) {
      throw new Error('Invalid amount: must be a positive finite number');
    }

    const filtered = this.filterProviders(params);
    if (filtered.length === 0) {
      throw new Error(
        `No providers support ${params.asset} on ${params.network} with ${params.fiatCurrency}`
      );
    }

    const ordered = this.orderProviders(filtered, 'off');

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
        operation: 'createOffRamp',
        attempt: attempts.length + 1,
        timestamp: new Date().toISOString(),
      });
      try {
        const result = await providerMeta.instance.createOffRamp(params);
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
          operation: 'createOffRamp',
          durationMs: latencyMs,
          attempt: attempts.length,
          timestamp: new Date().toISOString(),
        });
        this.events.emitEvent({
          type: 'request.success',
          provider: providerName,
          operation: 'createOffRamp',
          durationMs: latencyMs,
          timestamp: new Date().toISOString(),
        });

        await this.recordLedgerEntry({
          id: `${providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          operation: 'createOffRamp',
          provider: providerName,
          providerId: result.id,
          status: 'success',
          amount: params.cryptoAmount,
          currency: params.fiatCurrency,
          durationMs: latencyMs,
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

        if (breaker) await breaker.recordFailure();
        attempts.push({
          provider: providerName,
          status: 'failed',
          errorCode: error.code,
          errorMessage: sanitizeErrorMessage(error.message),
          latencyMs,
        });

        this.events.emitEvent({
          type: 'attempt.failure',
          provider: providerName,
          operation: 'createOffRamp',
          durationMs: latencyMs,
          errorCode: error.code,
          errorMessage: sanitizeErrorMessage(error.message),
          attempt: attempts.length,
          timestamp: new Date().toISOString(),
        });

        if (!this.fallback.enabled || attempts.length >= this.fallback.maxAttempts) {
          break;
        }

        await this.sleep(this.fallback.retryDelayMs);
      }
    }

    this.events.emitEvent({
      type: 'request.failure',
      operation: 'createOffRamp',
      errorMessage: lastError?.message || 'All providers failed',
      timestamp: new Date().toISOString(),
    });
    throw new RoutingError(
      `All providers failed: ${lastError?.message || 'Unknown error'}`,
      attempts
    );
  }

  async getRamp(id: string, provider?: string): Promise<RampResult> {
    if (provider) {
      const providerMeta = this.providers.find(
        p => p.instance.getProviderName() === provider
      );
      if (!providerMeta) {
        throw new Error(`Provider ${provider} not found in router`);
      }
      return providerMeta.instance.getRamp(id);
    }

    let lastError: Error | null = null;
    for (const providerMeta of this.providers) {
      try {
        return await providerMeta.instance.getRamp(id);
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new Error(
      `Ramp ${id} not found in any provider: ${lastError?.message || 'Unknown error'}`
    );
  }

  private filterProviders(
    params: { fiatCurrency: string; asset: string; network: string }
  ): ProviderWithMeta[] {
    return this.providers.filter(p => {
      const caps = p.instance.getCapabilities();

      if (!this.allowExperimental && caps.experimental === true) {
        return false;
      }

      if (!caps.supportedAssets.includes(params.asset)) {
        return false;
      }

      if (!caps.supportedNetworks.includes(params.network)) {
        return false;
      }

      if (!caps.supportedFiat.includes(params.fiatCurrency)) {
        return false;
      }

      return true;
    });
  }

  private orderProviders(
    providers: ProviderWithMeta[],
    direction: 'on' | 'off'
  ): ProviderWithMeta[] {
    switch (this.strategy) {
      case 'cheapest':
        return [...providers].sort((a, b) => {
          const capsA = a.instance.getCapabilities();
          const capsB = b.instance.getCapabilities();

          const feeA =
            direction === 'on' ? capsA.fees.onRampPercent : capsA.fees.offRampPercent;
          const feeB =
            direction === 'on' ? capsB.fees.onRampPercent : capsB.fees.offRampPercent;

          return feeA - feeB;
        });

      case 'fastest':
        return [...providers].sort((a, b) => {
          const capsA = a.instance.getCapabilities();
          const capsB = b.instance.getCapabilities();

          const latencyA = capsA.avgLatencyMs ?? Number.MAX_SAFE_INTEGER;
          const latencyB = capsB.avgLatencyMs ?? Number.MAX_SAFE_INTEGER;

          return latencyA - latencyB;
        });

      case 'priority':
        return [...providers].sort((a, b) => {
          const priorityA = a.priority ?? 0;
          const priorityB = b.priority ?? 0;
          return priorityB - priorityA;
        });

      case 'round-robin': {
        const idx = this.rrIndex;
        this.rrIndex = (this.rrIndex + 1) % providers.length;
        return [...providers.slice(idx), ...providers.slice(0, idx)];
      }

      default:
        return providers;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async recordLedgerEntry(entry: import('../ledger').LedgerEntry): Promise<void> {
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
