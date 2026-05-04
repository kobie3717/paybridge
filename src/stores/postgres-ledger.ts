import type { LedgerStore, LedgerEntry, LedgerQuery } from '../ledger';
import type { PgPoolLike } from './postgres';

export interface PostgresLedgerStoreOptions {
  pool: PgPoolLike;
  tableName?: string;
  schema?: string;
}

export function getCreateTableSql(tableName: string = 'paybridge_ledger', schema: string = 'public'): string {
  const fullTableName = `${schema}.${tableName}`;
  return `CREATE TABLE ${fullTableName} (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  reference TEXT,
  provider_id TEXT,
  status TEXT NOT NULL,
  amount NUMERIC,
  currency TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX idx_${tableName}_provider_timestamp
  ON ${fullTableName} (provider, timestamp DESC);

CREATE INDEX idx_${tableName}_reference
  ON ${fullTableName} (reference) WHERE reference IS NOT NULL;

CREATE INDEX idx_${tableName}_status
  ON ${fullTableName} (status);`;
}

export function createPostgresLedgerStore(opts: PostgresLedgerStoreOptions): LedgerStore {
  const tableName = opts.tableName ?? 'paybridge_ledger';
  const schema = opts.schema ?? 'public';
  const fullTableName = `${schema}.${tableName}`;

  return {
    async append(entry: LedgerEntry): Promise<void> {
      const sql = `INSERT INTO ${fullTableName} (
        id, timestamp, operation, provider, reference, provider_id,
        status, amount, currency, duration_ms, error_code, error_message, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;

      const params = [
        entry.id,
        entry.timestamp,
        entry.operation,
        entry.provider,
        entry.reference ?? null,
        entry.providerId ?? null,
        entry.status,
        entry.amount ?? null,
        entry.currency ?? null,
        entry.durationMs ?? null,
        entry.errorCode ?? null,
        entry.errorMessage ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ];

      await opts.pool.query(sql, params);
    },

    async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
      const whereClauses: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filter.reference !== undefined) {
        whereClauses.push(`reference = $${paramIndex++}`);
        params.push(filter.reference);
      }

      if (filter.provider !== undefined) {
        whereClauses.push(`provider = $${paramIndex++}`);
        params.push(filter.provider);
      }

      if (filter.status !== undefined) {
        whereClauses.push(`status = $${paramIndex++}`);
        params.push(filter.status);
      }

      if (filter.fromTimestamp !== undefined) {
        whereClauses.push(`timestamp >= $${paramIndex++}`);
        params.push(filter.fromTimestamp);
      }

      if (filter.toTimestamp !== undefined) {
        whereClauses.push(`timestamp <= $${paramIndex++}`);
        params.push(filter.toTimestamp);
      }

      const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
      const limitClause = filter.limit !== undefined ? `LIMIT $${paramIndex++}` : '';
      if (filter.limit !== undefined) {
        params.push(filter.limit);
      }

      const sql = `SELECT
        id, timestamp, operation, provider, reference, provider_id,
        status, amount, currency, duration_ms, error_code, error_message, metadata
      FROM ${fullTableName}
      ${whereClause}
      ORDER BY timestamp DESC
      ${limitClause}`.trim();

      const result = await opts.pool.query<{
        id: string;
        timestamp: string;
        operation: string;
        provider: string;
        reference: string | null;
        provider_id: string | null;
        status: string;
        amount: string | null;
        currency: string | null;
        duration_ms: number | null;
        error_code: string | null;
        error_message: string | null;
        metadata: any;
      }>(sql, params);

      return result.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        operation: row.operation as LedgerEntry['operation'],
        provider: row.provider,
        reference: row.reference ?? undefined,
        providerId: row.provider_id ?? undefined,
        status: row.status as LedgerEntry['status'],
        amount: row.amount !== null ? parseFloat(row.amount) : undefined,
        currency: row.currency ?? undefined,
        durationMs: row.duration_ms ?? undefined,
        errorCode: row.error_code ?? undefined,
        errorMessage: row.error_message ?? undefined,
        metadata: row.metadata ?? undefined,
      }));
    },
  };
}
