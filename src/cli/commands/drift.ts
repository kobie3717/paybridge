import * as path from 'node:path';
import { runners, ProviderRunner } from '../runners';
import { FileDriftStore, DriftStore } from '../drift-store';
import { captureShape, diffBaseline, ProviderBaseline, DriftReport } from '../../drift-detector';
import { colorize } from '../utils';

interface DriftCheckOptions {
  capture?: boolean;
  baselineDir?: string;
  json?: boolean;
  webhookUrl?: string;
  providers?: string[];
}

interface DriftCheckResult {
  provider: string;
  status: 'captured' | 'no-baseline' | 'no-drift' | 'drift' | 'skipped' | 'error';
  message?: string;
  report?: DriftReport;
  keyCount?: number;
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

export async function runDriftCheck(
  providedRunners: ProviderRunner[],
  store: DriftStore,
  opts: DriftCheckOptions
): Promise<DriftCheckResult[]> {
  const libVersion = '0.10.0';

  const results: DriftCheckResult[] = [];

  for (const runner of providedRunners) {
    const missing = runner.envRequired.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      results.push({
        provider: runner.name,
        status: 'skipped',
        message: `Missing: ${missing.join(', ')}`,
      });
      continue;
    }

    try {
      const response = await runner.run();
      const shape = captureShape(response);
      shape.status = response.status;

      if (opts.capture) {
        const baseline: ProviderBaseline = {
          providerName: runner.name,
          operation: 'createPayment',
          shape,
          libVersion,
        };
        await store.save(baseline);
        results.push({
          provider: runner.name,
          status: 'captured',
          keyCount: shape.keys.length,
        });
      } else {
        const baseline = await store.load(runner.name);
        if (!baseline) {
          results.push({
            provider: runner.name,
            status: 'no-baseline',
            message: 'No baseline found (run with --capture to create)',
          });
        } else {
          const report = diffBaseline(baseline, shape, runner.name);
          if (report.driftDetected) {
            results.push({
              provider: runner.name,
              status: 'drift',
              report,
            });
            if (opts.webhookUrl) {
              try {
                await postWebhook(opts.webhookUrl, { provider: runner.name, drift: report, libVersion });
              } catch (err: any) {
                console.error(`${colorize('[!]', 'yellow')} ${runner.name} webhook failed: ${err.message}`);
              }
            }
          } else {
            results.push({
              provider: runner.name,
              status: 'no-drift',
            });
          }
        }
      }
    } catch (error: any) {
      results.push({
        provider: runner.name,
        status: 'error',
        message: error.message || String(error),
      });
    }
  }

  return results;
}

export async function runDrift(args: string[]): Promise<void> {
  const capture = args.includes('--capture');
  const jsonOutput = args.includes('--json');
  const baselineDir =
    args.find((a, i) => args[i - 1] === '--baseline-dir') ||
    path.join(process.cwd(), '.paybridge', 'drift-baseline');
  const webhookUrl = args.find((a, i) => args[i - 1] === '--webhook-url');

  const providerNames = args.filter((a) => !a.startsWith('--') && a !== 'drift-check');

  let selectedRunners = runners;
  if (providerNames.length > 0) {
    selectedRunners = runners.filter((r) => providerNames.includes(r.name));
    const unknownProviders = providerNames.filter((p) => !runners.find((r) => r.name === p));
    if (unknownProviders.length > 0) {
      console.error(`Unknown providers: ${unknownProviders.join(', ')}`);
      console.error(`Available: ${runners.map((r) => r.name).join(', ')}`);
      process.exit(1);
    }
  }

  const store = new FileDriftStore(baselineDir);

  const results = await runDriftCheck(selectedRunners, store, { capture, baselineDir, json: jsonOutput, webhookUrl });

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    if (capture) {
      console.log('\n=== Drift Baseline Capture ===\n');
      for (const res of results) {
        if (res.status === 'captured') {
          console.log(`${colorize('[saved]', 'green')} ${res.provider} baseline (${res.keyCount} keys)`);
        } else if (res.status === 'skipped') {
          console.log(`${colorize('[ ]', 'dim')} ${res.provider} — ${res.message}`);
        } else if (res.status === 'error') {
          console.log(`${colorize('[✗]', 'red')} ${res.provider} ERROR: ${res.message}`);
        }
      }
    } else {
      console.log('\n=== Drift Detection ===\n');
      for (const res of results) {
        if (res.status === 'no-drift') {
          console.log(`${colorize('[✓]', 'green')} ${res.provider} — no drift`);
        } else if (res.status === 'no-baseline') {
          console.log(`${colorize('[ ]', 'dim')} ${res.provider} — ${res.message}`);
        } else if (res.status === 'skipped') {
          console.log(`${colorize('[ ]', 'dim')} ${res.provider} — ${res.message}`);
        } else if (res.status === 'drift' && res.report) {
          console.log(`${colorize('[⚠]', 'yellow')} ${res.provider} — drift detected:`);
          if (res.report.addedKeys.length > 0) {
            console.log(`    ${colorize('+', 'green')} new keys: ${res.report.addedKeys.join(', ')}`);
          }
          if (res.report.removedKeys.length > 0) {
            console.log(`    ${colorize('-', 'red')} removed keys: ${res.report.removedKeys.join(', ')}`);
          }
          if (res.report.typeChanges.length > 0) {
            for (const change of res.report.typeChanges) {
              console.log(
                `    ${colorize('!', 'yellow')} type changed: ${change.key} (${change.oldType} → ${change.newType})`
              );
            }
          }
          if (res.report.statusChanged) {
            console.log(
              `    ${colorize('!', 'yellow')} status changed: ${res.report.statusChanged.old} → ${
                res.report.statusChanged.new
              }`
            );
          }
        } else if (res.status === 'error') {
          console.log(`${colorize('[✗]', 'red')} ${res.provider} ERROR: ${res.message}`);
        }
      }
    }
  }

  const driftCount = results.filter((r) => r.status === 'drift').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  if (errorCount > 0) {
    process.exit(2);
  } else if (driftCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}
