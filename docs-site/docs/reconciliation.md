# Reconciliation

Webhooks can fail. Networks blip. Your server hiccups. Provider retries don't reach you. Without reconciliation, you discover missed webhooks when a customer complains their account wasn't credited.

PayBridge's **reconcile** command diffs your database against each provider's current state, catching payments where your local status doesn't match reality.

## Why Webhook-Only Is Insufficient

Provider webhooks are best-effort:
- **Network failures** — your server is down for 2 minutes during a deployment
- **Provider retry exhaustion** — they retry 3 times over 1 hour, then give up
- **Firewall rules** — a misconfigured security group blocks the webhook POST
- **Race conditions** — customer completes payment, webhook arrives before your DB transaction commits, dedup logic rejects it

In all these cases, the payment succeeds at the provider, but your local DB stays `pending` forever.

## Quick Start

### JSONL Format

One JSON object per line:

```jsonl
{"provider":"stripe","reference":"pay_001","expectedStatus":"pending"}
{"provider":"paystack","reference":"pay_002","expectedStatus":"completed"}
{"provider":"flutterwave","reference":"pay_003","expectedStatus":"pending"}
```

Run:

```bash
npx paybridge reconcile --input expected.jsonl
```

### CSV Format

Header row + data rows:

```csv
provider,reference,expectedStatus
stripe,pay_001,pending
paystack,pay_002,completed
flutterwave,pay_003,pending
```

Run:

```bash
npx paybridge reconcile --input payments.csv
```

Auto-detects format by first line.

### From Stdin

Pipe SQL query results directly:

```bash
psql -t -c "SELECT provider, reference, status AS \"expectedStatus\" FROM payments WHERE status='pending'" \
  | npx paybridge reconcile
```

## Example Output

```
[✓] stripe:pay_001 — completed (match)
[!] stripe:pay_002 — expected pending, actual completed (MISSED WEBHOOK)
[?] paystack:pay_003 — not-found (no provider record)
[✗] stripe:pay_004 — error (HTTP 503)
[ ] adyen:pay_005 — skipped (missing ADYEN_API_KEY)

Reconciled: 5
  Match: 1
  Mismatch (missed webhook): 1
  Not found: 1
  Error: 1
  Skipped: 1
```

Exit codes:
- **0** — clean (no mismatches)
- **1** — at least one mismatch detected
- **2** — hard error (all records failed)

## SQL Query Templates

### Postgres

Reconcile all pending payments from the last 24 hours:

```sql
SELECT 
  provider, 
  reference, 
  status AS "expectedStatus" 
FROM payments 
WHERE status = 'pending' 
  AND created_at > now() - interval '24 hours'
```

Pipe it:

```bash
psql -t -c "SELECT provider, reference, status AS \"expectedStatus\" FROM payments WHERE status='pending' AND created_at > now() - interval '24 hours'" \
  | npx paybridge reconcile
```

### MySQL

```sql
SELECT 
  provider, 
  reference, 
  status AS expectedStatus 
FROM payments 
WHERE status = 'pending' 
  AND created_at > NOW() - INTERVAL 24 HOUR
```

Pipe it:

```bash
mysql -N -e "SELECT provider, reference, status AS expectedStatus FROM payments WHERE status='pending' AND created_at > NOW() - INTERVAL 24 HOUR" \
  | npx paybridge reconcile
```

## Cron + Slack Integration

Run reconciliation every 6 hours and POST mismatch reports to Slack:

```bash
0 */6 * * * psql -t -c "SELECT provider, reference, status AS \"expectedStatus\" FROM payments WHERE status='pending' AND created_at > now() - interval '24 hours'" | /usr/local/bin/npx paybridge reconcile --webhook-url https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

The webhook payload:

```json
{
  "totalReconciled": 100,
  "missed": 3,
  "mismatches": [
    {
      "provider": "stripe",
      "reference": "pay_002",
      "expected": "pending",
      "actual": "completed"
    }
  ],
  "libVersion": "0.11.0"
}
```

Only POSTs when `missed > 0`.

## Programmatic API

Use `runReconcile` inside your own cron jobs, admin dashboards, or reconciliation pipeline:

```typescript
import { runReconcile, ReconcileRecord, ReconcileDeps, PayBridge } from 'paybridge';

const records: ReconcileRecord[] = [
  { provider: 'stripe', reference: 'pay_001', expectedStatus: 'pending' },
  { provider: 'stripe', reference: 'pay_002', expectedStatus: 'completed' },
];

const deps: ReconcileDeps = {
  buildProvider: (providerName) => {
    return new PayBridge({
      provider: providerName as any,
      credentials: getCredsFromEnv(providerName),
      sandbox: false,
    });
  },
  hasCredsFor: (providerName) => {
    return !!process.env[`${providerName.toUpperCase()}_API_KEY`];
  },
};

const { results, summary } = await runReconcile(records, deps, {
  onResult: (r) => {
    if (r.classification === 'mismatch') {
      console.log(`ALERT: ${r.provider}:${r.reference} - missed webhook`);
    }
  },
});

console.log(`Mismatches: ${summary.mismatch}`);
if (summary.mismatch > 0) {
  await sendSlackAlert(results.filter(r => r.classification === 'mismatch'));
}
```

## JSON Output Mode

For pipeline integration, use `--json`:

```bash
npx paybridge reconcile --input payments.jsonl --json
```

Outputs one JSON line per record:

```json
{"provider":"stripe","reference":"pay_001","expectedStatus":"pending","actualStatus":"completed","classification":"mismatch"}
{"provider":"stripe","reference":"pay_002","expectedStatus":"completed","actualStatus":"completed","classification":"match"}
{"summary":{"total":2,"match":1,"mismatch":1,"notFound":0,"error":0,"skipped":0}}
```

Parse with `jq`:

```bash
npx paybridge reconcile --input payments.jsonl --json | jq -r 'select(.classification=="mismatch") | "\(.provider):\(.reference)"'
```

## Supported Providers

Reconciliation works with all fiat providers that support `getPayment`:

- Stripe
- PayStack
- Flutterwave
- Adyen
- SoftyComp
- Yoco
- Ozow
- PayFast
- Peach Payments
- Mercado Pago
- Razorpay
- Mollie
- Square
- Pesapal

Skips providers with missing credentials (prints `[ ] provider:ref — skipped (missing creds)`).

## Best Practices

1. **Run frequently** — every 6h catches missed webhooks within a business day
2. **Filter by time** — only reconcile recent payments (last 24-48h) to keep API load low
3. **Alert on mismatch** — use `--webhook-url` to POST reports to Slack/PagerDuty
4. **Automate** — cron job + SQL query + `--webhook-url` = zero-touch reconciliation
5. **Track trends** — log `summary.mismatch` to a time-series DB; spike = provider webhook reliability issue

## Troubleshooting

### `[ ] provider:ref — skipped (missing STRIPE_API_KEY)`

Set env vars for the provider. Same vars as `paybridge test`:

```bash
export STRIPE_API_KEY=sk_test_...
export PAYSTACK_API_KEY=sk_test_...
```

### `[✗] provider:ref — error (HTTP 503)`

Provider API is down. Retry later. Reconcile exit code 2 means "hard error" (not a mismatch).

### `[?] provider:ref — not-found`

Provider has no record of this payment. Either:
- You created the record in your DB but never called `createPayment`
- The reference is wrong
- The provider purged old sandbox data

### Exit code 1 on clean run

Check for mismatches in the output. Exit code 1 means "at least one mismatch detected".
