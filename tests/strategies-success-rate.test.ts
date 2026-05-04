import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createSuccessRateStrategy, type SuccessRateStrategyOptions, type ProviderWithMeta } from '../src/strategies';
import type { LedgerStore, LedgerEntry, LedgerQuery } from '../src/ledger';
import { PayBridge } from '../src/index';

function createMockLedger(entries: LedgerEntry[]): LedgerStore {
  return {
    async append(entry: LedgerEntry): Promise<void> {
      entries.push(entry);
    },
    async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
      let results = entries;
      if (filter.provider) results = results.filter(e => e.provider === filter.provider);
      if (filter.fromTimestamp) results = results.filter(e => e.timestamp >= filter.fromTimestamp!);
      return results;
    },
  };
}

function createMockProvider(name: string): PayBridge {
  return {
    getProviderName: () => name,
    provider: {
      getCapabilities: () => ({
        fees: { fixed: 0, percent: 1.5, currency: 'USD' },
        currencies: ['USD'],
        country: 'US',
      }),
    },
  } as any;
}

test('successRate: ranks providers by success rate (high confidence)', async () => {
  const now = Date.now();
  const entries: LedgerEntry[] = [
    ...Array.from({ length: 99 }, (_, i) => ({
      id: `a-${i}`,
      timestamp: new Date(now - 1000 * i).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerA',
      status: 'success' as const,
    })),
    {
      id: 'a-fail',
      timestamp: new Date(now - 100000).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerA',
      status: 'failed' as const,
    },
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `b-${i}`,
      timestamp: new Date(now - 1000 * i).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerB',
      status: 'success' as const,
    })),
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `b-fail-${i}`,
      timestamp: new Date(now - 1000 * i).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerB',
      status: 'failed' as const,
    })),
  ];

  const ledger = createMockLedger(entries);
  const strategy = createSuccessRateStrategy({ ledger });

  const providers: ProviderWithMeta[] = [
    { instance: createMockProvider('providerB') },
    { instance: createMockProvider('providerA') },
  ];

  const ordered = await strategy.order(providers);

  assert.strictEqual(ordered.length, 2);
  assert.strictEqual(ordered[0].instance.getProviderName(), 'providerA');
  assert.strictEqual(ordered[1].instance.getProviderName(), 'providerB');
});

test('successRate: low confidence providers fall through to fallback strategy', async () => {
  const now = Date.now();
  const entries: LedgerEntry[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `c-${i}`,
      timestamp: new Date(now - 1000 * i).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerC',
      status: 'success' as const,
    })),
  ];

  const ledger = createMockLedger(entries);
  const strategy = createSuccessRateStrategy({ ledger, minSampleSize: 10, fallback: 'priority' });

  const providerA = createMockProvider('providerA');

  const providerC = createMockProvider('providerC');

  const providers: ProviderWithMeta[] = [
    { instance: providerA, priority: 5 },
    { instance: providerC, priority: 10 },
  ];

  const ordered = await strategy.order(providers);

  assert.strictEqual(ordered.length, 2);
  assert.strictEqual(ordered[0].instance.getProviderName(), 'providerC');
  assert.strictEqual(ordered[1].instance.getProviderName(), 'providerA');
});

test('successRate: cache TTL - only queries ledger once within cacheTtlMs', async () => {
  const entries: LedgerEntry[] = [];
  let queryCount = 0;
  const ledger: LedgerStore = {
    async append(entry: LedgerEntry): Promise<void> {
      entries.push(entry);
    },
    async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
      queryCount++;
      return entries;
    },
  };

  const strategy = createSuccessRateStrategy({ ledger, cacheTtlMs: 1000 });

  const providers: ProviderWithMeta[] = [
    { instance: createMockProvider('providerA') },
  ];

  await strategy.order(providers);
  await strategy.order(providers);

  assert.strictEqual(queryCount, 1);
});

test('successRate: cache expires after cacheTtlMs', async (t) => {
  const entries: LedgerEntry[] = [];
  let queryCount = 0;
  const ledger: LedgerStore = {
    async append(entry: LedgerEntry): Promise<void> {
      entries.push(entry);
    },
    async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
      queryCount++;
      return entries;
    },
  };

  const strategy = createSuccessRateStrategy({ ledger, cacheTtlMs: 50 });

  const providers: ProviderWithMeta[] = [
    { instance: createMockProvider('providerA') },
  ];

  await strategy.order(providers);
  await new Promise(resolve => setTimeout(resolve, 60));
  await strategy.order(providers);

  assert.strictEqual(queryCount, 2);
});

test('successRate: refresh() forces re-query', async () => {
  const entries: LedgerEntry[] = [];
  let queryCount = 0;
  const ledger: LedgerStore = {
    async append(entry: LedgerEntry): Promise<void> {
      entries.push(entry);
    },
    async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
      queryCount++;
      return entries;
    },
  };

  const strategy = createSuccessRateStrategy({ ledger, cacheTtlMs: 10000 });

  const providers: ProviderWithMeta[] = [
    { instance: createMockProvider('providerA') },
  ];

  await strategy.order(providers);
  await strategy.refresh();
  await strategy.order(providers);

  assert.strictEqual(queryCount, 2);
});

test('successRate: getRates() returns computed map', async () => {
  const now = Date.now();
  const entries: LedgerEntry[] = [
    ...Array.from({ length: 95 }, (_, i) => ({
      id: `a-${i}`,
      timestamp: new Date(now - 1000 * i).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerA',
      status: 'success' as const,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `a-fail-${i}`,
      timestamp: new Date(now - 1000 * i).toISOString(),
      operation: 'createPayment' as const,
      provider: 'providerA',
      status: 'failed' as const,
    })),
  ];

  const ledger = createMockLedger(entries);
  const strategy = createSuccessRateStrategy({ ledger });

  const providers: ProviderWithMeta[] = [
    { instance: createMockProvider('providerA') },
  ];

  await strategy.order(providers);

  const rates = strategy.getRates();
  assert.strictEqual(rates.size, 1);
  const providerARate = rates.get('providerA');
  assert.ok(providerARate);
  assert.strictEqual(providerARate.sampleSize, 100);
  assert.strictEqual(providerARate.successRate, 0.95);
});

test('successRate: empty ledger - all providers fall through to fallback', async () => {
  const ledger = createMockLedger([]);
  const strategy = createSuccessRateStrategy({ ledger, fallback: 'priority' });

  const providers: ProviderWithMeta[] = [
    { instance: createMockProvider('providerA'), priority: 10 },
    { instance: createMockProvider('providerB'), priority: 20 },
  ];

  const ordered = await strategy.order(providers);

  assert.strictEqual(ordered.length, 2);
  assert.strictEqual(ordered[0].instance.getProviderName(), 'providerB');
  assert.strictEqual(ordered[1].instance.getProviderName(), 'providerA');
});
