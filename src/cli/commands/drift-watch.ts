import * as path from 'node:path';
import { runners } from '../runners';
import { FileDriftStore } from '../drift-store';
import { runDriftCheck } from './drift';
import { colorize } from '../utils';

const INTERVALS = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

function parseInterval(str: string): number {
  const interval = INTERVALS[str as keyof typeof INTERVALS];
  if (!interval) {
    throw new Error(`Invalid interval: ${str}. Supported: ${Object.keys(INTERVALS).join(', ')}`);
  }
  return interval;
}

export async function runDriftWatch(args: string[]): Promise<void> {
  const intervalArg = args.find((a, i) => args[i - 1] === '--interval') || '6h';
  const interval = parseInterval(intervalArg);
  const once = args.includes('--once');
  const webhookUrl = args.find((a, i) => args[i - 1] === '--webhook-url');
  const baselineDir =
    args.find((a, i) => args[i - 1] === '--baseline-dir') ||
    path.join(process.cwd(), '.paybridge', 'drift-baseline');

  const store = new FileDriftStore(baselineDir);

  let running = true;

  const cleanup = () => {
    running = false;
    console.log('\nStopping drift watch...');
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  const runCheck = async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n${colorize('[drift-watch]', 'cyan')} Running check at ${timestamp}\n`);

    try {
      const results = await runDriftCheck(runners, store, { webhookUrl });

      const driftCount = results.filter((r) => r.status === 'drift').length;
      const noDriftCount = results.filter((r) => r.status === 'no-drift').length;
      const skippedCount = results.filter((r) => r.status === 'skipped').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      for (const res of results) {
        if (res.status === 'drift' && res.report) {
          console.log(`${colorize('[⚠]', 'yellow')} ${res.provider} — drift detected`);
          if (res.report.addedKeys.length > 0) {
            console.log(`    + new keys: ${res.report.addedKeys.join(', ')}`);
          }
          if (res.report.removedKeys.length > 0) {
            console.log(`    - removed keys: ${res.report.removedKeys.join(', ')}`);
          }
          if (res.report.typeChanges.length > 0) {
            for (const change of res.report.typeChanges) {
              console.log(`    ! type changed: ${change.key} (${change.oldType} → ${change.newType})`);
            }
          }
        } else if (res.status === 'error') {
          console.log(`${colorize('[✗]', 'red')} ${res.provider} ERROR: ${res.message}`);
        }
      }

      console.log(
        `\n${colorize('[summary]', 'cyan')} drift: ${driftCount}, clean: ${noDriftCount}, skipped: ${skippedCount}, errors: ${errorCount}`
      );
    } catch (err: any) {
      console.error(`${colorize('[!]', 'red')} Check failed: ${err.message}`);
    }
  };

  await runCheck();

  if (once) {
    process.exit(0);
  }

  console.log(`\n${colorize('[drift-watch]', 'cyan')} Watching every ${intervalArg}. Press Ctrl+C to stop.\n`);

  const timer = setInterval(() => {
    if (running) {
      runCheck();
    }
  }, interval);

  timer.unref();

  await new Promise(() => {});
}
