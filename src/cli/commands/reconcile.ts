import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { PayBridge } from '../../index';
import { runners } from '../runners';
import { runReconcile } from '../reconcile';
import { ReconcileRecord, ReconcileResult } from '../reconcile-types';
import { colorize } from '../utils';

interface ReconcileOptions {
  input?: string;
  json?: boolean;
  webhookUrl?: string;
}

function parseOptions(args: string[]): ReconcileOptions {
  const opts: ReconcileOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      opts.input = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      opts.json = true;
    } else if (args[i] === '--webhook-url' && args[i + 1]) {
      opts.webhookUrl = args[i + 1];
      i++;
    }
  }

  return opts;
}

async function parseInput(input?: string): Promise<ReconcileRecord[]> {
  const lines: string[] = [];

  if (input) {
    const content = fs.readFileSync(input, 'utf8');
    lines.push(...content.split('\n').filter((l) => l.trim()));
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line.trim());
      }
    }
  }

  if (lines.length === 0) {
    return [];
  }

  const firstLine = lines[0];
  const isCsv = /^provider\s*,\s*reference\s*,\s*expectedStatus/i.test(firstLine);

  const records: ReconcileRecord[] = [];

  if (isCsv) {
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((s) => s.trim());
      if (parts.length >= 3) {
        records.push({
          provider: parts[0],
          reference: parts[1],
          expectedStatus: parts[2],
        });
      }
    }
  } else {
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.provider && obj.reference && obj.expectedStatus) {
          records.push({
            provider: obj.provider,
            reference: obj.reference,
            expectedStatus: obj.expectedStatus,
          });
        }
      } catch (e) {
        console.error(`${colorize('[!]', 'yellow')} Skipping invalid JSON line: ${line}`);
      }
    }
  }

  return records;
}

function buildProvider(providerName: string): PayBridge {
  const runner = runners.find((r) => r.name === providerName);
  if (!runner) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const missing = runner.envRequired.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(', ')}`);
  }

  switch (providerName) {
    case 'stripe':
      return new PayBridge({
        provider: 'stripe',
        credentials: { apiKey: process.env.STRIPE_API_KEY! },
        sandbox: true,
      });
    case 'paystack':
      return new PayBridge({
        provider: 'paystack',
        credentials: { apiKey: process.env.PAYSTACK_API_KEY! },
        sandbox: true,
      });
    case 'flutterwave':
      return new PayBridge({
        provider: 'flutterwave',
        credentials: { apiKey: process.env.FLUTTERWAVE_API_KEY! },
        sandbox: true,
      });
    case 'adyen':
      return new PayBridge({
        provider: 'adyen',
        credentials: {
          apiKey: process.env.ADYEN_API_KEY!,
          merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT!,
        },
        sandbox: true,
      });
    case 'softycomp':
      return new PayBridge({
        provider: 'softycomp',
        credentials: {
          apiKey: process.env.SOFTYCOMP_API_KEY!,
          secretKey: process.env.SOFTYCOMP_SECRET_KEY!,
        },
        sandbox: true,
      });
    case 'yoco':
      return new PayBridge({
        provider: 'yoco',
        credentials: { apiKey: process.env.YOCO_API_KEY! },
        sandbox: true,
      });
    case 'ozow':
      return new PayBridge({
        provider: 'ozow',
        credentials: {
          apiKey: process.env.OZOW_API_KEY!,
          siteCode: process.env.OZOW_SITE_CODE!,
          privateKey: process.env.OZOW_PRIVATE_KEY!,
        },
        sandbox: true,
      });
    case 'payfast':
      return new PayBridge({
        provider: 'payfast',
        credentials: {
          merchantId: process.env.PAYFAST_MERCHANT_ID!,
          merchantKey: process.env.PAYFAST_MERCHANT_KEY!,
          passphrase: process.env.PAYFAST_PASSPHRASE,
        },
        sandbox: true,
      });
    case 'peach':
      return new PayBridge({
        provider: 'peach',
        credentials: {
          apiKey: process.env.PEACH_ACCESS_TOKEN!,
          secretKey: process.env.PEACH_ENTITY_ID!,
        },
        sandbox: true,
      });
    case 'mercadopago':
      return new PayBridge({
        provider: 'mercadopago',
        credentials: { apiKey: process.env.MERCADOPAGO_ACCESS_TOKEN! },
        sandbox: true,
      });
    case 'razorpay':
      return new PayBridge({
        provider: 'razorpay',
        credentials: {
          apiKey: process.env.RAZORPAY_KEY_ID!,
          secretKey: process.env.RAZORPAY_KEY_SECRET!,
        },
        sandbox: true,
      });
    case 'mollie':
      return new PayBridge({
        provider: 'mollie',
        credentials: { apiKey: process.env.MOLLIE_API_KEY! },
        sandbox: true,
      });
    case 'square':
      return new PayBridge({
        provider: 'square',
        credentials: {
          apiKey: process.env.SQUARE_ACCESS_TOKEN!,
          locationId: process.env.SQUARE_LOCATION_ID!,
        },
        sandbox: true,
      });
    case 'pesapal':
      return new PayBridge({
        provider: 'pesapal',
        credentials: {
          apiKey: process.env.PESAPAL_CONSUMER_KEY!,
          secretKey: process.env.PESAPAL_CONSUMER_SECRET!,
          notificationId: process.env.PESAPAL_NOTIFICATION_ID,
        },
        sandbox: true,
      });
    default:
      throw new Error(`Provider ${providerName} not implemented in reconcile`);
  }
}

function hasCredsFor(providerName: string): boolean {
  const runner = runners.find((r) => r.name === providerName);
  if (!runner) {
    return false;
  }
  return runner.envRequired.every((key) => !!process.env[key]);
}

function printResult(result: ReconcileResult): void {
  const { provider, reference, classification, expectedStatus, actualStatus, errorMessage } = result;

  let icon: string;
  let message: string;

  switch (classification) {
    case 'match':
      icon = colorize('[✓]', 'green');
      message = `${provider}:${reference} — ${actualStatus} (match)`;
      break;
    case 'mismatch':
      icon = colorize('[!]', 'yellow');
      message = `${provider}:${reference} — expected ${expectedStatus}, actual ${actualStatus} (MISSED WEBHOOK)`;
      break;
    case 'not-found':
      icon = colorize('[?]', 'yellow');
      message = `${provider}:${reference} — not-found (no provider record)`;
      break;
    case 'error':
      icon = colorize('[✗]', 'red');
      message = `${provider}:${reference} — error (${errorMessage})`;
      break;
    case 'skipped':
      icon = colorize('[ ]', 'dim');
      message = `${provider}:${reference} — skipped (${errorMessage})`;
      break;
  }

  console.log(`${icon} ${message}`);
}

async function postWebhook(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Webhook POST failed: ${res.status} ${res.statusText}`);
  }
}

export async function runReconcileCommand(args: string[]): Promise<void> {
  const opts = parseOptions(args);

  const records = await parseInput(opts.input);

  if (records.length === 0) {
    console.error('No records to reconcile. Provide input via stdin or --input <file>.');
    process.exit(1);
  }

  const { results, summary } = await runReconcile(records, { buildProvider, hasCredsFor }, {
    onResult: opts.json ? undefined : printResult,
  });

  if (opts.json) {
    for (const result of results) {
      console.log(JSON.stringify(result));
    }
    console.log(JSON.stringify({ summary }));
  } else {
    console.log(`\nReconciled: ${summary.total}`);
    console.log(`  Match: ${summary.match}`);
    console.log(`  Mismatch (missed webhook): ${summary.mismatch}`);
    console.log(`  Not found: ${summary.notFound}`);
    console.log(`  Error: ${summary.error}`);
    console.log(`  Skipped: ${summary.skipped}`);
  }

  if (opts.webhookUrl && summary.mismatch > 0) {
    const mismatches = results.filter((r) => r.classification === 'mismatch');
    const payload = {
      totalReconciled: summary.total,
      missed: summary.mismatch,
      mismatches: mismatches.map((r) => ({
        provider: r.provider,
        reference: r.reference,
        expected: r.expectedStatus,
        actual: r.actualStatus,
      })),
      libVersion: '0.11.0',
    };

    try {
      await postWebhook(opts.webhookUrl, payload);
      if (!opts.json) {
        console.log(`\n${colorize('[webhook]', 'cyan')} Posted mismatch report to ${opts.webhookUrl}`);
      }
    } catch (err: any) {
      console.error(`${colorize('[!]', 'yellow')} Webhook POST failed: ${err.message}`);
    }
  }

  if (summary.mismatch > 0) {
    process.exit(1);
  } else if (summary.error > 0 && summary.match === 0) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}
