import { promises as fs } from 'node:fs';
import { generateAuditReport, renderAuditAsHtml, renderAuditAsMarkdown, renderAuditAsJson, type AuditInput } from '../../audit-report';
import { FileDriftStore } from '../drift-store';
import { createPostgresLedgerStore } from '../../stores/postgres-ledger';
import { runners } from '../runners';
import { PayBridge } from '../../index';
import { runReconcile } from '../reconcile';
import { readStdin, colorize } from '../utils';
import type { ReconcileRecord } from '../reconcile-types';

interface AuditOptions {
  output?: string;
  format: 'html' | 'md' | 'json';
  window: number;
  providers?: string[];
  ledgerPg?: string;
  driftDir: string;
  reconcileInput?: string;
}

function parseWindow(windowStr: string): number {
  const match = windowStr.match(/^(\d+)(d|h|m)$/);
  if (!match) {
    throw new Error(`Invalid window format: ${windowStr}. Use format like 7d, 24h, 60m`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

function parseArgs(args: string[]): AuditOptions {
  const opts: AuditOptions = {
    format: 'html',
    window: 7 * 24 * 60 * 60 * 1000,
    driftDir: '.paybridge/drift-baseline',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--output':
        opts.output = args[++i];
        break;
      case '--format':
        const format = args[++i];
        if (format !== 'html' && format !== 'md' && format !== 'json') {
          throw new Error(`Invalid format: ${format}. Use html, md, or json`);
        }
        opts.format = format;
        break;
      case '--window':
        opts.window = parseWindow(args[++i]);
        break;
      case '--providers':
        opts.providers = args[++i].split(',').map((s) => s.trim());
        break;
      case '--ledger-pg':
        opts.ledgerPg = args[++i];
        break;
      case '--drift-dir':
        opts.driftDir = args[++i];
        break;
      case '--reconcile-input':
        opts.reconcileInput = args[++i];
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!opts.output) {
    const timestamp = new Date().toISOString().split('T')[0];
    const ext = opts.format === 'html' ? 'html' : opts.format === 'md' ? 'md' : 'json';
    opts.output = `paybridge-audit-${timestamp}.${ext}`;
  }

  return opts;
}

function printHelp(): void {
  console.log(`
paybridge audit — Generate comprehensive payment stack audit report

USAGE
  paybridge audit [options]

OPTIONS
  --output <file>          Output file path (default: paybridge-audit-<date>.<ext>)
                           Use '-' for stdout
  --format <type>          Output format: html, md, json (default: html)
  --window <duration>      Analysis window: 7d, 30d, 90d, 24h, 1d (default: 7d)
  --providers <list>       Comma-separated provider names (default: all configured)
  --ledger-pg <conn>       PostgreSQL connection string for ledger data
  --drift-dir <path>       Drift baseline directory (default: .paybridge/drift-baseline)
  --reconcile-input <file> Include reconciliation data from file (JSONL or CSV)
  -h, --help               Print this help

EXAMPLES
  paybridge audit
  paybridge audit --window 30d --format json --output report.json
  paybridge audit --ledger-pg postgresql://user:pass@localhost/db
  paybridge audit --output - --format md | mail -s "Audit" finance@example.com

EXIT CODES
  0  No high-severity anomalies
  1  High-severity anomalies detected

OUTPUT
  HTML reports are print-to-PDF friendly (Cmd/Ctrl+P in browser).
  JSON reports can be piped to CI/CD pipelines.

Docs: https://github.com/kobie3717/paybridge
  `.trim());
}

export async function runAudit(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  const providerConfigs = opts.providers
    ? runners.filter((r) => opts.providers!.includes(r.name))
    : runners.filter((r) => r.envRequired.every((e) => process.env[e]));

  const providers = providerConfigs.map((r) => {
    let credentials: any = {};

    for (const envVar of r.envRequired) {
      if (envVar === 'STRIPE_API_KEY') credentials.apiKey = process.env.STRIPE_API_KEY;
      else if (envVar === 'YOCO_API_KEY') credentials.apiKey = process.env.YOCO_API_KEY;
      else if (envVar === 'SOFTYCOMP_API_KEY') {
        credentials.apiKey = process.env.SOFTYCOMP_API_KEY;
        credentials.secretKey = process.env.SOFTYCOMP_SECRET_KEY;
      } else if (envVar === 'OZOW_API_KEY') {
        credentials.apiKey = process.env.OZOW_API_KEY;
        credentials.siteCode = process.env.OZOW_SITE_CODE;
        credentials.privateKey = process.env.OZOW_PRIVATE_KEY;
      } else if (envVar === 'PAYFAST_MERCHANT_ID') {
        credentials.merchantId = process.env.PAYFAST_MERCHANT_ID;
        credentials.merchantKey = process.env.PAYFAST_MERCHANT_KEY;
        credentials.passphrase = process.env.PAYFAST_PASSPHRASE;
      } else if (envVar === 'PAYSTACK_API_KEY') credentials.apiKey = process.env.PAYSTACK_API_KEY;
      else if (envVar === 'PEACH_ACCESS_TOKEN') {
        credentials.apiKey = process.env.PEACH_ACCESS_TOKEN;
        credentials.secretKey = process.env.PEACH_ENTITY_ID;
      } else if (envVar === 'FLUTTERWAVE_API_KEY') credentials.apiKey = process.env.FLUTTERWAVE_API_KEY;
      else if (envVar === 'ADYEN_API_KEY') {
        credentials.apiKey = process.env.ADYEN_API_KEY;
        credentials.merchantAccount = process.env.ADYEN_MERCHANT_ACCOUNT;
      } else if (envVar === 'MERCADOPAGO_ACCESS_TOKEN') credentials.apiKey = process.env.MERCADOPAGO_ACCESS_TOKEN;
      else if (envVar === 'RAZORPAY_KEY_ID') {
        credentials.apiKey = process.env.RAZORPAY_KEY_ID;
        credentials.secretKey = process.env.RAZORPAY_KEY_SECRET;
      } else if (envVar === 'MOLLIE_API_KEY') credentials.apiKey = process.env.MOLLIE_API_KEY;
      else if (envVar === 'SQUARE_ACCESS_TOKEN') {
        credentials.apiKey = process.env.SQUARE_ACCESS_TOKEN;
        credentials.locationId = process.env.SQUARE_LOCATION_ID;
      } else if (envVar === 'PESAPAL_CONSUMER_KEY') {
        credentials.apiKey = process.env.PESAPAL_CONSUMER_KEY;
        credentials.secretKey = process.env.PESAPAL_CONSUMER_SECRET;
        credentials.notificationId = process.env.PESAPAL_NOTIFICATION_ID || 'dummy';
      }
    }

    const pay = new PayBridge({
      provider: r.name as any,
      credentials,
      sandbox: true,
    });
    return {
      name: r.name,
      capabilities: pay.provider.getCapabilities(),
    };
  });

  if (providers.length === 0) {
    console.error(colorize('Error: No providers configured. Set environment variables for at least one provider.', 'red'));
    process.exit(1);
  }

  const input: AuditInput = {
    providers,
    windowMs: opts.window,
  };

  if (opts.ledgerPg) {
    try {
      // @ts-ignore - pg is an optional peer dependency
      const pgModule = await import('pg');
      const Pool = pgModule.default?.Pool || pgModule.Pool;
      const pool = new Pool({ connectionString: opts.ledgerPg });
      input.ledger = createPostgresLedgerStore({ pool });
    } catch (err: any) {
      console.error(colorize(`Error: pg module not installed. Run: npm install pg`, 'red'));
      process.exit(1);
    }
  }

  if (opts.driftDir) {
    input.driftStore = new FileDriftStore(opts.driftDir);
  }

  if (opts.reconcileInput) {
    const content = await fs.readFile(opts.reconcileInput, 'utf-8');
    const records: ReconcileRecord[] = [];

    const lines = content.trim().split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.trim()) continue;

      if (line.trim().startsWith('{')) {
        const record = JSON.parse(line) as ReconcileRecord;
        records.push(record);
      } else {
        const parts = line.split(/\t|,/).map((s) => s.trim());
        if (parts.length >= 3) {
          records.push({
            provider: parts[0],
            reference: parts[1],
            expectedStatus: parts[2],
          });
        }
      }
    }

    const buildProvider = (providerName: string) => {
      const runner = runners.find((r) => r.name === providerName);
      if (!runner) throw new Error(`Unknown provider: ${providerName}`);
      return new PayBridge({
        provider: providerName as any,
        credentials: {},
        sandbox: true,
      });
    };

    const hasCredsFor = (providerName: string) => {
      const runner = runners.find((r) => r.name === providerName);
      return runner ? runner.envRequired.every((e) => process.env[e]) : false;
    };

    const { results } = await runReconcile(records, { buildProvider, hasCredsFor });
    input.reconcileResults = results;
  }

  const report = await generateAuditReport(input);

  let output: string;
  switch (opts.format) {
    case 'html':
      output = renderAuditAsHtml(report);
      break;
    case 'md':
      output = renderAuditAsMarkdown(report);
      break;
    case 'json':
      output = renderAuditAsJson(report, true);
      break;
  }

  if (opts.output === '-') {
    console.log(output);
  } else {
    if (!opts.output) {
      throw new Error('Output path is required');
    }
    await fs.writeFile(opts.output, output, 'utf-8');
    console.log(colorize(`Audit written to ${opts.output}`, 'green'));
    console.log(`Total providers: ${report.summary.totalProviders}`);
    console.log(`Anomalies: ${colorize(`${report.summary.anomalyCounts.high}`, report.summary.anomalyCounts.high > 0 ? 'red' : 'green')} high, ${report.summary.anomalyCounts.medium} medium, ${report.summary.anomalyCounts.low} low`);
    if (opts.format === 'html') {
      console.log(colorize('Open in browser to review.', 'cyan'));
    }
  }

  if (report.summary.anomalyCounts.high > 0) {
    process.exit(1);
  }
}
