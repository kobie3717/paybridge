import { test } from 'node:test';
import * as assert from 'node:assert';
import { runReconcile, ReconcileDeps } from '../src/cli/reconcile';
import { ReconcileRecord, ReconcileResult } from '../src/cli/reconcile-types';
import { PayBridge } from '../src/index';

function createMockProvider(getPaymentImpl: (id: string) => Promise<{ id: string; status: string }>): PayBridge {
  return {
    getPayment: getPaymentImpl,
  } as any;
}

test('reconcile: match classification', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_001', expectedStatus: 'completed' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) => createMockProvider(async (id) => ({ id, status: 'completed' })),
    hasCredsFor: () => true,
  };

  const { results, summary } = await runReconcile(records, deps);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].classification, 'match');
  assert.strictEqual(results[0].actualStatus, 'completed');
  assert.strictEqual(summary.match, 1);
  assert.strictEqual(summary.mismatch, 0);
});

test('reconcile: mismatch classification', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_002', expectedStatus: 'pending' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) => createMockProvider(async (id) => ({ id, status: 'completed' })),
    hasCredsFor: () => true,
  };

  const { results, summary } = await runReconcile(records, deps);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].classification, 'mismatch');
  assert.strictEqual(results[0].expectedStatus, 'pending');
  assert.strictEqual(results[0].actualStatus, 'completed');
  assert.strictEqual(summary.match, 0);
  assert.strictEqual(summary.mismatch, 1);
});

test('reconcile: not-found classification', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_999', expectedStatus: 'pending' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) =>
      createMockProvider(async (id) => {
        throw new Error('Payment not found');
      }),
    hasCredsFor: () => true,
  };

  const { results, summary } = await runReconcile(records, deps);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].classification, 'not-found');
  assert.strictEqual(summary.notFound, 1);
});

test('reconcile: error classification', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_err', expectedStatus: 'pending' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) =>
      createMockProvider(async (id) => {
        throw new Error('HTTP 503 Service Unavailable');
      }),
    hasCredsFor: () => true,
  };

  const { results, summary } = await runReconcile(records, deps);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].classification, 'error');
  assert.strictEqual(summary.error, 1);
});

test('reconcile: skipped classification', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'adyen', reference: 'pay_skip', expectedStatus: 'pending' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) => {
      throw new Error('Should not be called');
    },
    hasCredsFor: (name) => false,
  };

  const { results, summary } = await runReconcile(records, deps);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].classification, 'skipped');
  assert.strictEqual(summary.skipped, 1);
});

test('reconcile: multiple providers use single instance', async () => {
  const buildCalls = new Map<string, number>();

  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_001', expectedStatus: 'completed' },
    { provider: 'stripe', reference: 'pay_002', expectedStatus: 'pending' },
    { provider: 'paystack', reference: 'pay_003', expectedStatus: 'completed' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) => {
      buildCalls.set(name, (buildCalls.get(name) || 0) + 1);
      return createMockProvider(async (id) => ({ id, status: 'completed' }));
    },
    hasCredsFor: () => true,
  };

  await runReconcile(records, deps);

  assert.strictEqual(buildCalls.get('stripe'), 1);
  assert.strictEqual(buildCalls.get('paystack'), 1);
});

test('reconcile: summary counts correct', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_match', expectedStatus: 'completed' },
    { provider: 'stripe', reference: 'pay_mismatch', expectedStatus: 'pending' },
    { provider: 'stripe', reference: 'pay_notfound', expectedStatus: 'pending' },
    { provider: 'stripe', reference: 'pay_error', expectedStatus: 'pending' },
    { provider: 'adyen', reference: 'pay_skip', expectedStatus: 'pending' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) =>
      createMockProvider(async (id) => {
        if (id === 'pay_match') return { id, status: 'completed' };
        if (id === 'pay_mismatch') return { id, status: 'completed' };
        if (id === 'pay_notfound') throw new Error('Payment not found');
        if (id === 'pay_error') throw new Error('HTTP 500');
        throw new Error('Unknown');
      }),
    hasCredsFor: (name) => name !== 'adyen',
  };

  const { summary } = await runReconcile(records, deps);

  assert.strictEqual(summary.total, 5);
  assert.strictEqual(summary.match, 1);
  assert.strictEqual(summary.mismatch, 1);
  assert.strictEqual(summary.notFound, 1);
  assert.strictEqual(summary.error, 1);
  assert.strictEqual(summary.skipped, 1);
});

test('reconcile: onResult callback invoked', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_001', expectedStatus: 'completed' },
  ];

  const callbackResults: ReconcileResult[] = [];

  const deps: ReconcileDeps = {
    buildProvider: (name) => createMockProvider(async (id) => ({ id, status: 'completed' })),
    hasCredsFor: () => true,
  };

  await runReconcile(records, deps, {
    onResult: (r) => callbackResults.push(r),
  });

  assert.strictEqual(callbackResults.length, 1);
  assert.strictEqual(callbackResults[0].classification, 'match');
});

test('reconcile: errors in one record do not abort others', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_error', expectedStatus: 'pending' },
    { provider: 'stripe', reference: 'pay_ok', expectedStatus: 'completed' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) =>
      createMockProvider(async (id) => {
        if (id === 'pay_error') throw new Error('Boom');
        return { id, status: 'completed' };
      }),
    hasCredsFor: () => true,
  };

  const { results } = await runReconcile(records, deps);

  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].classification, 'error');
  assert.strictEqual(results[1].classification, 'match');
});

test('reconcile: 404 error detected as not-found', async () => {
  const records: ReconcileRecord[] = [
    { provider: 'stripe', reference: 'pay_404', expectedStatus: 'pending' },
  ];

  const deps: ReconcileDeps = {
    buildProvider: (name) =>
      createMockProvider(async (id) => {
        throw new Error('HTTP 404 - Payment not found');
      }),
    hasCredsFor: () => true,
  };

  const { results } = await runReconcile(records, deps);

  assert.strictEqual(results[0].classification, 'not-found');
});
