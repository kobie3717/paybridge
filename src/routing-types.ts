/**
 * Types for payment routing
 */

import { Currency } from './types';

export interface ProviderFees {
  fixed: number;
  percent: number;
  currency: Currency;
}

export interface ProviderCapabilities {
  fees: ProviderFees;
  currencies: string[];
  minAmount?: number;
  maxAmount?: number;
  avgLatencyMs?: number;
  country: string;
}

export interface RoutingAttempt {
  provider: string;
  status: 'success' | 'failed' | 'skipped';
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
}

export interface RoutingMeta {
  attempts: RoutingAttempt[];
  chosenProvider: string;
  strategy: RoutingStrategy;
}

export type RoutingStrategy = 'cheapest' | 'fastest' | 'priority' | 'round-robin';

export interface FallbackConfig {
  enabled: boolean;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export class RoutingError extends Error {
  public readonly attempts: RoutingAttempt[];

  constructor(message: string, attempts: RoutingAttempt[]) {
    super(message);
    this.name = 'RoutingError';
    this.attempts = attempts;
  }
}
