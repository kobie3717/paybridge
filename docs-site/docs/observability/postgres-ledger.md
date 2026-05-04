# PostgreSQL Ledger

Durable transaction history backed by Postgres. For production workloads where you need persistent audit trails, the Postgres adapter stores every payment attempt in a relational table.

## When to use

- **Production**: Persistent history across app restarts
- **Compliance**: Audit trails that survive crashes
- **Analytics**: Query transaction history with SQL
- **Reconciliation**: Long-term reference for dispute resolution

In-memory and Redis adapters are ephemeral. Use Postgres when transaction history is critical.

## Schema Setup

Create the table once via your migration tool:

```typescript
import { getPostgresLedgerTableSql } from 'paybridge';

const sql = getPostgresLedgerTableSql();
await pool.query(sql);
```

Or run the SQL manually:

```sql
CREATE TABLE paybridge_ledger (
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

CREATE INDEX idx_paybridge_ledger_provider_timestamp
  ON paybridge_ledger (provider, timestamp DESC);
CREATE INDEX idx_paybridge_ledger_reference
  ON paybridge_ledger (reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_paybridge_ledger_status
  ON paybridge_ledger (status);
```

## Basic Usage

```typescript
import { Pool } from 'pg';
import { PayBridgeRouter, createPostgresLedgerStore } from 'paybridge';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const ledger = createPostgresLedgerStore({ pool });

const router = new PayBridgeRouter({
  providers: [...],
  ledger
});
```

## Custom Table Name

```typescript
const ledger = createPostgresLedgerStore({
  pool,
  tableName: 'payment_audit_log',
  schema: 'audit'
});

const sql = getPostgresLedgerTableSql('payment_audit_log', 'audit');
await pool.query(sql);
```

## Adapter Compatibility

Works with:
- `pg` — `Pool` from the official PostgreSQL client
- `postgres` — porsager's adapter wrapper

No runtime dependency on `pg`. Bring your own client.

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ledger = createPostgresLedgerStore({ pool });
```

## Querying the Ledger

```typescript
const entries = await ledger.query({
  provider: 'stripe',
  status: 'success',
  fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
  limit: 100
});

console.log(`${entries.length} successful Stripe transactions in last 24h`);
```

## SQL Injection Safety

All queries use parameterized values (`$1`, `$2`, etc.). No string concatenation of user input. Provider name, status, and all filter values are bound parameters.

## Example: Success Rate Report

```typescript
const result = await pool.query(`
  SELECT
    provider,
    COUNT(*) FILTER (WHERE status = 'success') AS success_count,
    COUNT(*) AS total_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) AS success_rate
  FROM paybridge_ledger
  WHERE timestamp > NOW() - INTERVAL '7 days'
  GROUP BY provider
  ORDER BY success_rate DESC
`);

console.table(result.rows);
```

## Performance

Indexes cover common queries:
- `(provider, timestamp DESC)` — provider performance over time
- `(reference)` — lookup by payment reference
- `(status)` — filter by outcome

Typical write: <5ms. Typical query: <10ms for last 24h of a single provider.

## Next Steps

- [Success Rate Routing](/routing/success-rate) — use ledger data to rank providers by real outcomes
- [Ledger Overview](/observability/ledger) — in-memory and Redis adapters
- [Reconciliation](/reconciliation) — detect missed webhooks
