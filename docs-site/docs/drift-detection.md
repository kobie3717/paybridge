# Drift Detection

Payment provider APIs drift over time. A field gets renamed, an endpoint moves, a type changes from `string` to `number`. Your integration silently breaks in production.

PayBridge includes **drift detection** — capture the shape of every provider's sandbox response, store it as a baseline, and get alerted the moment something changes.

## Why Drift Detection?

Most payment SDKs trust provider documentation. Docs lie. Providers update APIs without notice. Breaking changes get deployed as "improvements."

**Real example:** Square's payment links endpoint changed from `/checkout/payment-links` to `/online-checkout/payment-links` between releases. No deprecation notice. No version bump. Would have shipped silently to production.

`drift-check` turns ad-hoc validation into a 1-line cron job.

## Quick Start

### 1. Capture Baselines

Run once to capture the current response shapes for all providers with env vars set:

```bash
npx paybridge drift-check --capture
```

This creates `.paybridge/drift-baseline/<provider>.json` files in your project. Each file is a human-readable snapshot:

```json
{
  "providerName": "stripe",
  "operation": "createPayment",
  "shape": {
    "keys": ["id", "object", "url", "client_secret", "status"],
    "types": {
      "id": "string",
      "object": "string",
      "url": "string",
      "client_secret": "string",
      "status": "string"
    },
    "status": "pending",
    "capturedAt": "2026-05-04T12:00:00.000Z"
  },
  "libVersion": "0.10.0"
}
```

Add `.paybridge/` to `.gitignore` (PayBridge does this automatically).

### 2. Check for Drift

Run anytime to compare current responses against baselines:

```bash
npx paybridge drift-check
```

**Clean run:**

```
=== Drift Detection ===

[✓] stripe — no drift
[✓] mollie — no drift
[✓] square — no drift
[ ] paystack — Missing: PAYSTACK_API_KEY
```

Exit code: 0

**Drift detected:**

```
=== Drift Detection ===

[✓] stripe — no drift
[⚠] mollie — drift detected:
    + new keys: data.expiresAt, _links.dashboard.href
    - removed keys: data.metadata.legacy
    ! type changed: data.amount.value (string → number)
[⚠] square — drift detected:
    + new keys: payment_link.created_at_iso
```

Exit code: 1

### 3. Check Single Provider

```bash
npx paybridge drift-check stripe
```

Useful for debugging or when you only have credentials for one provider.

## Continuous Monitoring

### drift-watch

Run drift-check on a loop:

```bash
npx paybridge drift-watch --interval 6h
```

Runs every 6 hours. Logs drift to stdout. Supports `30m`, `1h`, `6h`, `12h`, `24h`.

**Example:**

```bash
npx paybridge drift-watch --interval 1h --webhook-url https://hooks.slack.com/services/YOUR/WEBHOOK
```

Sends a webhook POST when drift is detected:

```json
{
  "provider": "mollie",
  "drift": {
    "providerName": "mollie",
    "driftDetected": true,
    "addedKeys": ["data.expiresAt"],
    "removedKeys": ["data.metadata.legacy"],
    "typeChanges": [
      { "key": "data.amount.value", "oldType": "string", "newType": "number" }
    ],
    "baselineCapturedAt": "2026-05-04T12:00:00.000Z",
    "newCapturedAt": "2026-05-04T18:00:00.000Z"
  },
  "libVersion": "0.10.0"
}
```

### SystemD Timer (Production)

Create `/etc/systemd/system/paybridge-drift.service`:

```ini
[Unit]
Description=PayBridge Drift Detection
After=network.target

[Service]
Type=oneshot
User=youruser
WorkingDirectory=/path/to/your/app
EnvironmentFile=/path/to/your/.env
ExecStart=/usr/bin/npx paybridge drift-check --webhook-url https://hooks.slack.com/...
```

Create `/etc/systemd/system/paybridge-drift.timer`:

```ini
[Unit]
Description=Run PayBridge drift check every 6 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl enable paybridge-drift.timer
sudo systemctl start paybridge-drift.timer
```

Check status:

```bash
systemctl list-timers --all
journalctl -u paybridge-drift.service
```

## Webhook Integrations

### Slack

1. Create an [Incoming Webhook](https://api.slack.com/messaging/webhooks)
2. Use the webhook URL:

```bash
npx paybridge drift-check --webhook-url https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
```

The POST payload is JSON. Slack accepts it directly if you transform it:

```typescript
// In your Slack app webhook handler
const slackPayload = {
  text: `🚨 Drift detected in ${payload.provider}`,
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Provider:* ${payload.provider}\n*Added keys:* ${payload.drift.addedKeys.join(', ')}`
      }
    }
  ]
};
```

Or use a middleware service like Zapier to transform the webhook.

### Discord

1. Create a webhook in Server Settings → Integrations → Webhooks
2. Use the webhook URL with `/slack` suffix:

```bash
npx paybridge drift-check --webhook-url https://discord.com/api/webhooks/123456789/XXXXXXXXXXXXXXXXXXXX/slack
```

Discord's Slack-compatible endpoint accepts the POST directly.

### PagerDuty

1. Create an Events API v2 integration
2. Use the integration key:

```bash
npx paybridge drift-check --webhook-url https://events.pagerduty.com/v2/enqueue
```

POST payload:

```json
{
  "routing_key": "YOUR_INTEGRATION_KEY",
  "event_action": "trigger",
  "payload": {
    "summary": "PayBridge drift detected in mollie",
    "severity": "warning",
    "source": "paybridge",
    "custom_details": { ... }
  }
}
```

Transform the webhook via middleware or use a custom endpoint.

## CLI Reference

### `drift-check`

**Usage:**

```bash
paybridge drift-check [provider] [options]
```

**Options:**

- `--capture` — Capture baseline snapshots (init mode). Overwrites existing baselines.
- `--json` — Output JSON instead of human-readable format. Useful for scripting.
- `--baseline-dir <path>` — Custom baseline location. Default: `.paybridge/drift-baseline`.
- `--webhook-url <url>` — POST drift report to URL on detection. Fires once per drifted provider.

**Examples:**

```bash
# Capture all providers
paybridge drift-check --capture

# Check all providers
paybridge drift-check

# Check one provider
paybridge drift-check stripe

# JSON output
paybridge drift-check --json

# Custom baseline location
paybridge drift-check --baseline-dir /var/paybridge-baselines

# Webhook alert
paybridge drift-check --webhook-url https://hooks.slack.com/...
```

**Exit codes:**

- `0` — No drift detected or all providers skipped
- `1` — Drift detected in at least one provider
- `2` — Error (network, bad credentials, etc.)

### `drift-watch`

**Usage:**

```bash
paybridge drift-watch [options]
```

**Options:**

- `--interval <duration>` — Check interval. Supports `30m`, `1h`, `6h`, `12h`, `24h`. Default: `6h`.
- `--webhook-url <url>` — POST drift report to URL on detection.
- `--baseline-dir <path>` — Custom baseline location.
- `--once` — Alias for `drift-check` (run once, don't loop).

**Examples:**

```bash
# Watch every 6 hours (default)
paybridge drift-watch

# Watch every 1 hour
paybridge drift-watch --interval 1h

# With webhook
paybridge drift-watch --interval 6h --webhook-url https://hooks.slack.com/...

# Run once (same as drift-check)
paybridge drift-watch --once
```

**Long-running:** `drift-watch` runs indefinitely. Press `Ctrl+C` to stop. Use SystemD, Docker, or a process manager in production.

## Storage

Baselines are stored as JSON files at `.paybridge/drift-baseline/<provider>.json`.

**Why file-based?**

- Human-readable. Inspect diffs with `git diff` or `jq`.
- Portable. Works in CI, local dev, production.
- No external dependencies (Redis, DB, etc.).

**Should I commit baselines to Git?**

**No.** Baselines capture sandbox responses, which may include provider-specific IDs or sandbox metadata. They're environment-specific.

`.gitignore` rule:

```
.paybridge/
```

PayBridge adds this automatically if `.gitignore` exists.

## Programmatic Use

Use the drift detector module directly:

```typescript
import { captureShape, compareShapes, diffBaseline } from 'paybridge/drift-detector';
import { FileDriftStore } from 'paybridge/cli/drift-store';

// Capture a response shape
const response = await fetch('https://api.provider.com/payment');
const json = await response.json();
const shape = captureShape(json);

console.log(shape.keys); // ["id", "status", "amount.value", "amount.currency"]
console.log(shape.types); // { "id": "string", "status": "string", ... }

// Compare shapes
const baseline = { keys: ["id", "status"], types: { id: "string", status: "string" } };
const diff = compareShapes(baseline, shape);

console.log(diff.addedKeys); // ["amount.value", "amount.currency"]
console.log(diff.removedKeys); // []
console.log(diff.typeChanges); // []

// Full baseline diff
const baselineObj = {
  providerName: 'stripe',
  operation: 'createPayment',
  shape: baseline,
  libVersion: '0.10.0',
};

const report = diffBaseline(baselineObj, shape, 'stripe');
console.log(report.driftDetected); // true
console.log(report.addedKeys); // ["amount.value", "amount.currency"]
```

### Custom Storage

Implement the `DriftStore` interface:

```typescript
import { DriftStore, ProviderBaseline } from 'paybridge/cli/drift-store';

class RedisDriftStore implements DriftStore {
  async load(providerName: string): Promise<ProviderBaseline | null> {
    const data = await redis.get(`drift:${providerName}`);
    return data ? JSON.parse(data) : null;
  }

  async save(baseline: ProviderBaseline): Promise<void> {
    await redis.set(`drift:${baseline.providerName}`, JSON.stringify(baseline));
  }

  async listProviders(): Promise<string[]> {
    const keys = await redis.keys('drift:*');
    return keys.map(k => k.replace('drift:', ''));
  }
}
```

Use with `runDriftCheck`:

```typescript
import { runDriftCheck } from 'paybridge/cli/commands/drift';
import { runners } from 'paybridge/cli/runners';

const store = new RedisDriftStore();
const results = await runDriftCheck(runners, store, { capture: true });
```

## FAQ

### How does drift detection work?

1. **Capture:** Runs `createPayment` sandbox call → extracts all JSON keys + types → stores as baseline
2. **Compare:** Runs `createPayment` again → compares current shape vs baseline → reports differences
3. **Alert:** Optional webhook fires when drift detected

### What gets captured?

- All JSON keys (dot-delimited, e.g., `data.amount.value`)
- Types (`string`, `number`, `boolean`, `object`, `array`, `null`)
- HTTP status or driver-mapped status
- Timestamp

### Does drift-check hit production APIs?

**No.** Drift-check only runs against **sandbox** environments. Runners use `sandbox: true` config. No real charges, no production writes.

### What if I don't have sandbox credentials?

Providers without env vars are skipped. You can run drift-check with just one provider configured:

```bash
STRIPE_API_KEY=sk_test_... npx paybridge drift-check stripe
```

### When should I recapture baselines?

- After intentional provider API upgrades
- After PayBridge version bumps (if provider drivers changed)
- After provider announces breaking changes

Run `--capture` to overwrite:

```bash
npx paybridge drift-check --capture
```

### Can I version baselines?

Yes. Use `--baseline-dir` to store per-environment baselines:

```bash
# Staging
paybridge drift-check --baseline-dir .paybridge/staging --capture

# Production
paybridge drift-check --baseline-dir .paybridge/prod --capture
```

Compare them:

```bash
diff .paybridge/staging/stripe.json .paybridge/prod/stripe.json
```

### Does drift-check support crypto providers?

Not yet. Drift-check currently only validates fiat payment providers (`createPayment` operation). Crypto on/off-ramp support planned for 0.11.

## Next Steps

- [CLI Reference](/cli) — full CLI command docs
- [Providers](/providers/overview) — per-provider capabilities
- [Observability](/observability/events) — router events and ledger
