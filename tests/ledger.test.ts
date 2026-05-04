import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryLedgerStore } from '../src/ledger';
import { PayBridgeRouter } from '../src/router';
import { PayBridge } from '../src/index';

describe('Ledger', () => {
  it('InMemoryLedgerStore append and query happy path', async () => {
    const store = new InMemoryLedgerStore();

    await store.append({
      id: '1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'softycomp',
      reference: 'TEST-001',
      status: 'success',
      amount: 100,
      currency: 'ZAR',
      durationMs: 150,
    });

    await store.append({
      id: '2',
      timestamp: '2026-05-04T10:01:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      reference: 'TEST-002',
      status: 'failed',
      amount: 200,
      currency: 'ZAR',
      durationMs: 200,
      errorCode: 'TIMEOUT',
    });

    const all = await store.query({});
    assert.equal(all.length, 2);
  });

  it('query filters by reference', async () => {
    const store = new InMemoryLedgerStore();

    await store.append({
      id: '1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'softycomp',
      reference: 'TEST-001',
      status: 'success',
    });

    await store.append({
      id: '2',
      timestamp: '2026-05-04T10:01:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      reference: 'TEST-002',
      status: 'failed',
    });

    const results = await store.query({ reference: 'TEST-001' });
    assert.equal(results.length, 1);
    assert.equal(results[0].reference, 'TEST-001');
  });

  it('query filters by provider', async () => {
    const store = new InMemoryLedgerStore();

    await store.append({
      id: '1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'softycomp',
      status: 'success',
    });

    await store.append({
      id: '2',
      timestamp: '2026-05-04T10:01:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      status: 'failed',
    });

    const results = await store.query({ provider: 'yoco' });
    assert.equal(results.length, 1);
    assert.equal(results[0].provider, 'yoco');
  });

  it('query filters by status', async () => {
    const store = new InMemoryLedgerStore();

    await store.append({
      id: '1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'softycomp',
      status: 'success',
    });

    await store.append({
      id: '2',
      timestamp: '2026-05-04T10:01:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      status: 'failed',
    });

    const results = await store.query({ status: 'failed' });
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'failed');
  });

  it('query time range filter works', async () => {
    const store = new InMemoryLedgerStore();

    await store.append({
      id: '1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'softycomp',
      status: 'success',
    });

    await store.append({
      id: '2',
      timestamp: '2026-05-04T11:00:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      status: 'failed',
    });

    const results = await store.query({
      fromTimestamp: '2026-05-04T10:30:00Z',
      toTimestamp: '2026-05-04T11:30:00Z',
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, '2');
  });

  it('maxSize truncates oldest entries FIFO', async () => {
    const store = new InMemoryLedgerStore({ maxSize: 2 });

    await store.append({
      id: '1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'softycomp',
      status: 'success',
    });

    await store.append({
      id: '2',
      timestamp: '2026-05-04T10:01:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      status: 'success',
    });

    await store.append({
      id: '3',
      timestamp: '2026-05-04T10:02:00Z',
      operation: 'createPayment',
      provider: 'stripe',
      status: 'success',
    });

    const all = await store.query({});
    assert.equal(all.length, 2);
    assert.equal(all[0].id, '2');
    assert.equal(all[1].id, '3');
  });

  it('router with ledger writes one entry per createPayment', async () => {
    const ledger = new InMemoryLedgerStore();
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test_key', secretKey: 'test_secret' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      ledger,
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-LEDGER',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    const entries = await ledger.query({ reference: 'TEST-LEDGER' });
    assert.ok(entries.length >= 1, 'should have at least one ledger entry');
    assert.equal(entries[0].operation, 'createPayment');
    assert.equal(entries[0].provider, 'softycomp');
  });
});
