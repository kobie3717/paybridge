/**
 * Routing strategies for multi-provider payments
 */

import { PayBridge } from './index';
import { CreatePaymentParams, Currency } from './types';
import { RoutingStrategy } from './routing-types';

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
