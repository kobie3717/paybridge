/**
 * Routing strategies for multi-provider payments
 */

import { PayBridge } from './index';
import { CreatePaymentParams, Currency } from './types';
import { RoutingStrategy } from './routing-types';
import type { LedgerStore } from './ledger';

export interface ProviderWithMeta {
  instance: PayBridge;
  weight?: number;
  priority?: number;
}

export interface StrategyContext {
  amount: number;
  currency: Currency;
}

export type Strategy = (
  providers: ProviderWithMeta[],
  context: StrategyContext,
  getRRIndex?: () => number
) => ProviderWithMeta[];

export const strategies: Record<RoutingStrategy, Strategy> = {
  cheapest: (providers, context) => {
    return [...providers].sort((a, b) => {
      const capsA = a.instance.provider.getCapabilities();
      const capsB = b.instance.provider.getCapabilities();

      const feeA = capsA.fees.fixed + (context.amount * capsA.fees.percent) / 100;
      const feeB = capsB.fees.fixed + (context.amount * capsB.fees.percent) / 100;

      return feeA - feeB;
    });
  },

  fastest: (providers, _context) => {
    return [...providers].sort((a, b) => {
      const capsA = a.instance.provider.getCapabilities();
      const capsB = b.instance.provider.getCapabilities();

      const latencyA = capsA.avgLatencyMs ?? Number.MAX_SAFE_INTEGER;
      const latencyB = capsB.avgLatencyMs ?? Number.MAX_SAFE_INTEGER;

      return latencyA - latencyB;
    });
  },

  priority: (providers, _context) => {
    return [...providers].sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA;
    });
  },

  'round-robin': (providers, _context, getRRIndex) => {
    if (!getRRIndex) {
      return providers;
    }
    const idx = getRRIndex();
    return [...providers.slice(idx), ...providers.slice(0, idx)];
  },
};

export function getStrategy(name: RoutingStrategy): Strategy {
  return strategies[name];
}

export interface SuccessRateStrategyOptions {
  ledger: LedgerStore;
  windowMs?: number;
  cacheTtlMs?: number;
  minSampleSize?: number;
  fallback?: 'cheapest' | 'fastest' | 'priority' | 'round-robin';
}

export interface SuccessRateStrategy {
  order: (providers: ProviderWithMeta[]) => Promise<ProviderWithMeta[]>;
  refresh: () => Promise<void>;
  getRates: () => Map<string, { successRate: number; sampleSize: number }>;
}

export function createSuccessRateStrategy(opts: SuccessRateStrategyOptions): SuccessRateStrategy {
  const windowMs = opts.windowMs ?? 24 * 60 * 60 * 1000;
  const cacheTtlMs = opts.cacheTtlMs ?? 60 * 1000;
  const minSampleSize = opts.minSampleSize ?? 10;
  const fallbackName = opts.fallback ?? 'cheapest';
  const fallbackStrategy = strategies[fallbackName];

  let cachedRates: Map<string, { successRate: number; sampleSize: number }> = new Map();
  let lastRefreshTime = 0;

  async function computeRates(): Promise<Map<string, { successRate: number; sampleSize: number }>> {
    const now = Date.now();
    const fromTimestamp = new Date(now - windowMs).toISOString();

    const entries = await opts.ledger.query({
      fromTimestamp,
    });

    const providerStats = new Map<string, { total: number; success: number }>();

    for (const entry of entries) {
      if (!providerStats.has(entry.provider)) {
        providerStats.set(entry.provider, { total: 0, success: 0 });
      }
      const stats = providerStats.get(entry.provider)!;
      stats.total++;
      if (entry.status === 'success') {
        stats.success++;
      }
    }

    const rates = new Map<string, { successRate: number; sampleSize: number }>();
    for (const [provider, stats] of providerStats) {
      rates.set(provider, {
        successRate: stats.total > 0 ? stats.success / stats.total : 0,
        sampleSize: stats.total,
      });
    }

    return rates;
  }

  async function ensureFreshCache(): Promise<void> {
    const now = Date.now();
    if (now - lastRefreshTime > cacheTtlMs) {
      cachedRates = await computeRates();
      lastRefreshTime = now;
    }
  }

  return {
    async order(providers: ProviderWithMeta[]): Promise<ProviderWithMeta[]> {
      await ensureFreshCache();

      const highConfidence: Array<{ provider: ProviderWithMeta; rate: number }> = [];
      const lowConfidence: ProviderWithMeta[] = [];

      for (const provider of providers) {
        const providerName = provider.instance.getProviderName();
        const stats = cachedRates.get(providerName);

        if (stats && stats.sampleSize >= minSampleSize) {
          highConfidence.push({ provider, rate: stats.successRate });
        } else {
          lowConfidence.push(provider);
        }
      }

      highConfidence.sort((a, b) => b.rate - a.rate);

      const sortedLowConfidence = fallbackStrategy(lowConfidence, { amount: 0, currency: 'USD' });

      return [...highConfidence.map(h => h.provider), ...sortedLowConfidence];
    },

    async refresh(): Promise<void> {
      cachedRates = await computeRates();
      lastRefreshTime = Date.now();
    },

    getRates(): Map<string, { successRate: number; sampleSize: number }> {
      return new Map(cachedRates);
    },
  };
}
