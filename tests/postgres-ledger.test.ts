import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createPostgresLedgerStore, getCreateTableSql, type PostgresLedgerStoreOptions } from '../src/stores/postgres-ledger';
import type { PgPoolLike, PgQueryResult } from '../src/stores/postgres';
import type { LedgerEntry } from '../src/ledger';

interface MockQuery {
  sql: string;
  params: unknown[];
}

function createMockPool(mockRows: any[] = []): { pool: PgPoolLike; queries: MockQuery[] } {
  const queries: MockQuery[] = [];
  const pool: PgPoolLike = {
    async query<T = any>(sql: string, params?: unknown[]): Promise<PgQueryResult<T>> {
      queries.push({ sql, params: params ?? [] });
      return {
        rows: mockRows as T[],
        rowCount: mockRows.length,
      };
    },
  };
  return { pool, queries };
}

test('postgres-ledger: append issues INSERT with parameterized values', async () => {
  const { pool, queries } = createMockPool();
  const store = createPostgresLedgerStore({ pool });

  const entry: LedgerEntry = {
    id: 'test-123',
    timestamp: '2026-05-04T10:00:00Z',
    operation: 'createPayment',
    provider: 'stripe',
    reference: 'INV-001',
    providerId: 'ch_abc123',
    status: 'success',
    amount: 100.5,
    currency: 'USD',
    durationMs: 150,
    errorCode: undefined,
    errorMessage: undefined,
    metadata: { foo: 'bar' },
  };

  await store.append(entry);

  assert.strictEqual(queries.length, 1);
  const query = queries[0];
  assert.match(query.sql, /INSERT INTO public\.paybridge_ledger/i);
  assert.match(query.sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13\)/);
  assert.strictEqual(query.params[0], 'test-123');
  assert.strictEqual(query.params[1], '2026-05-04T10:00:00Z');
  assert.strictEqual(query.params[2], 'createPayment');
  assert.strictEqual(query.params[3], 'stripe');
  assert.strictEqual(query.params[4], 'INV-001');
  assert.strictEqual(query.params[5], 'ch_abc123');
  assert.strictEqual(query.params[6], 'success');
  assert.strictEqual(query.params[7], 100.5);
  assert.strictEqual(query.params[8], 'USD');
  assert.strictEqual(query.params[9], 150);
  assert.strictEqual(query.params[10], null);
  assert.strictEqual(query.params[11], null);
  assert.strictEqual(query.params[12], JSON.stringify({ foo: 'bar' }));
});

test('postgres-ledger: custom tableName and schema honored', async () => {
  const { pool, queries } = createMockPool();
  const store = createPostgresLedgerStore({ pool, tableName: 'my_ledger', schema: 'custom_schema' });

  const entry: LedgerEntry = {
    id: 'test-456',
    timestamp: '2026-05-04T10:00:00Z',
    operation: 'refund',
    provider: 'yoco',
    status: 'failed',
  };

  await store.append(entry);

  assert.strictEqual(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO custom_schema\.my_ledger/);
});

test('postgres-ledger: query with provider filter builds WHERE provider = $1', async () => {
  const mockRows = [
    {
      id: 'test-1',
      timestamp: '2026-05-04T10:00:00Z',
      operation: 'createPayment',
      provider: 'stripe',
      reference: null,
      provider_id: 'ch_1',
      status: 'success',
      amount: '100',
      currency: 'USD',
      duration_ms: 120,
      error_code: null,
      error_message: null,
      metadata: null,
    },
  ];
  const { pool, queries } = createMockPool(mockRows);
  const store = createPostgresLedgerStore({ pool });

  const results = await store.query({ provider: 'stripe' });

  assert.strictEqual(queries.length, 1);
  const query = queries[0];
  assert.match(query.sql, /WHERE provider = \$1/);
  assert.deepStrictEqual(query.params, ['stripe']);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 'test-1');
  assert.strictEqual(results[0].provider, 'stripe');
});

test('postgres-ledger: query with provider and status builds WHERE provider = $1 AND status = $2', async () => {
  const { pool, queries } = createMockPool([]);
  const store = createPostgresLedgerStore({ pool });

  await store.query({ provider: 'stripe', status: 'success' });

  assert.strictEqual(queries.length, 1);
  const query = queries[0];
  assert.match(query.sql, /WHERE provider = \$1 AND status = \$2/);
  assert.deepStrictEqual(query.params, ['stripe', 'success']);
});

test('postgres-ledger: query with fromTimestamp and toTimestamp builds WHERE timestamp >= $1 AND timestamp <= $2', async () => {
  const { pool, queries } = createMockPool([]);
  const store = createPostgresLedgerStore({ pool });

  await store.query({
    fromTimestamp: '2026-05-01T00:00:00Z',
    toTimestamp: '2026-05-04T23:59:59Z',
  });

  assert.strictEqual(queries.length, 1);
  const query = queries[0];
  assert.match(query.sql, /WHERE timestamp >= \$1 AND timestamp <= \$2/);
  assert.deepStrictEqual(query.params, ['2026-05-01T00:00:00Z', '2026-05-04T23:59:59Z']);
});

test('postgres-ledger: query with limit appends LIMIT $N', async () => {
  const { pool, queries } = createMockPool([]);
  const store = createPostgresLedgerStore({ pool });

  await store.query({ limit: 10 });

  assert.strictEqual(queries.length, 1);
  const query = queries[0];
  assert.match(query.sql, /LIMIT \$1/);
  assert.deepStrictEqual(query.params, [10]);
});

test('postgres-ledger: query with no filter builds SELECT with no WHERE', async () => {
  const { pool, queries } = createMockPool([]);
  const store = createPostgresLedgerStore({ pool });

  await store.query({});

  assert.strictEqual(queries.length, 1);
  const query = queries[0];
  assert.doesNotMatch(query.sql, /WHERE/);
  assert.match(query.sql, /ORDER BY timestamp DESC/);
  assert.strictEqual(query.params.length, 0);
});

test('postgres-ledger: query rows mapped from snake_case to camelCase', async () => {
  const mockRows = [
    {
      id: 'entry-1',
      timestamp: '2026-05-04T11:30:00Z',
      operation: 'createPayment',
      provider: 'yoco',
      reference: 'REF-123',
      provider_id: 'yoco_pay_456',
      status: 'success',
      amount: '250.75',
      currency: 'ZAR',
      duration_ms: 200,
      error_code: null,
      error_message: null,
      metadata: { test: 'data' },
    },
  ];
  const { pool, queries } = createMockPool(mockRows);
  const store = createPostgresLedgerStore({ pool });

  const results = await store.query({});

  assert.strictEqual(results.length, 1);
  const entry = results[0];
  assert.strictEqual(entry.id, 'entry-1');
  assert.strictEqual(entry.timestamp, '2026-05-04T11:30:00Z');
  assert.strictEqual(entry.operation, 'createPayment');
  assert.strictEqual(entry.provider, 'yoco');
  assert.strictEqual(entry.reference, 'REF-123');
  assert.strictEqual(entry.providerId, 'yoco_pay_456');
  assert.strictEqual(entry.status, 'success');
  assert.strictEqual(entry.amount, 250.75);
  assert.strictEqual(entry.currency, 'ZAR');
  assert.strictEqual(entry.durationMs, 200);
  assert.strictEqual(entry.errorCode, undefined);
  assert.strictEqual(entry.errorMessage, undefined);
  assert.deepStrictEqual(entry.metadata, { test: 'data' });
});

test('postgres-ledger: getCreateTableSql returns valid SQL with table name and indexes', async () => {
  const sql = getCreateTableSql();

  assert.match(sql, /CREATE TABLE public\.paybridge_ledger/);
  assert.match(sql, /id TEXT PRIMARY KEY/);
  assert.match(sql, /timestamp TIMESTAMPTZ NOT NULL/);
  assert.match(sql, /metadata JSONB/);
  assert.match(sql, /CREATE INDEX idx_paybridge_ledger_provider_timestamp/);
  assert.match(sql, /CREATE INDEX idx_paybridge_ledger_reference/);
  assert.match(sql, /CREATE INDEX idx_paybridge_ledger_status/);
});

test('postgres-ledger: getCreateTableSql with custom table name and schema', async () => {
  const sql = getCreateTableSql('my_ledger', 'custom');

  assert.match(sql, /CREATE TABLE custom\.my_ledger/);
  assert.match(sql, /CREATE INDEX idx_my_ledger_provider_timestamp/);
  assert.match(sql, /ON custom\.my_ledger \(provider, timestamp DESC\)/);
});
