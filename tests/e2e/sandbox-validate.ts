/**
 * Sandbox Validation Harness
 *
 * Validates all providers against their real sandbox environments.
 * Runs createPayment against each provider's sandbox if credentials are provided.
 *
 * SAFETY: Only creates checkout URLs (amount: R1/$1, reference: e2e-<timestamp>).
 * Does NOT complete transactions or charge cards. Safe to run repeatedly.
 *
 * Usage:
 *   npm run test:e2e:sandbox
 *
 *   # With credentials for specific providers:
 *   SOFTYCOMP_API_KEY=xxx SOFTYCOMP_SECRET_KEY=xxx npm run test:e2e:sandbox
 *   YOCO_API_KEY=sk_test_xxx npm run test:e2e:sandbox
 *   STRIPE_API_KEY=sk_test_xxx npm run test:e2e:sandbox
 *
 * Exit code: 0 if no failures, 1 if any provider fails (skipped = OK)
 */

import { runners } from '../../src/cli/runners';

interface ValidationResult {
  provider: string;
  status: 'skipped' | 'success' | 'failed' | 'partial';
  message?: string;
  data?: {
    id?: string;
    checkoutUrl?: string;
    status?: string;
  };
}

const results: ValidationResult[] = [];

function log(message: string) {
  console.log(message);
}

async function validateProvider(
  name: string,
  envRequired: string[],
  runFn: () => Promise<{ id: string; checkoutUrl?: string; status: string }>
): Promise<void> {
  const missing = envRequired.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    results.push({ provider: name, status: 'skipped', message: `Missing: ${missing.join(', ')}` });
    log(`[ ] ${name} - skipped (missing env: ${missing.join(', ')})`);
    return;
  }

  log(`[…] ${name} - validating...`);

  try {
    const result = await runFn();

    if (!result.id) {
      throw new Error('No payment ID returned');
    }

    results.push({
      provider: name,
      status: 'success',
      data: {
        id: result.id,
        checkoutUrl: result.checkoutUrl,
        status: result.status,
      },
    });

    log(`[✓] ${name} → id=${result.id}${result.checkoutUrl ? `, url=${result.checkoutUrl.substring(0, 60)}...` : ''}, status=${result.status}`);
  } catch (error: any) {
    results.push({
      provider: name,
      status: 'failed',
      message: error.message || String(error),
    });
    log(`[✗] ${name} ERROR: ${error.message || String(error)}`);
  }
}

async function validateRedirectProvider(
  name: string,
  envRequired: string[],
  runFn: () => Promise<{ id: string; checkoutUrl: string; status: string }>
): Promise<void> {
  const missing = envRequired.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    results.push({ provider: name, status: 'skipped', message: `Missing: ${missing.join(', ')}` });
    log(`[ ] ${name} - skipped (missing env: ${missing.join(', ')})`);
    return;
  }

  log(`[…] ${name} - validating...`);

  try {
    const result = await runFn();

    if (!result.id || !result.checkoutUrl) {
      throw new Error('Missing payment ID or checkout URL');
    }

    const url = new URL(result.checkoutUrl);
    const hasSignature = url.searchParams.has('signature') || url.searchParams.has('checksum') || url.searchParams.has('CHECKSUM');

    results.push({
      provider: name,
      status: 'partial',
      message: `URL signed: ${hasSignature}`,
      data: {
        id: result.id,
        checkoutUrl: result.checkoutUrl,
        status: result.status,
      },
    });

    log(`[~] ${name} → URL signed: ${hasSignature ? 'yes' : 'no'}, redirect to verify`);
    log(`    ${result.checkoutUrl.substring(0, 100)}...`);
  } catch (error: any) {
    results.push({
      provider: name,
      status: 'failed',
      message: error.message || String(error),
    });
    log(`[✗] ${name} ERROR: ${error.message || String(error)}`);
  }
}

async function runValidation() {
  console.log('\n=== PayBridge Sandbox Validation ===\n');
  console.log('Testing all providers against real sandbox environments.');
  console.log('Safe to run: creates checkout URLs only, no actual charges.\n');

  for (const runner of runners) {
    await validateProvider(runner.name, runner.envRequired, runner.run);
  }

  // Summary
  console.log('\n=== Summary ===\n');

  const validated = results.filter((r) => r.status === 'success').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  results.forEach((r) => {
    const icon =
      r.status === 'success' ? '[✓]' : r.status === 'partial' ? '[~]' : r.status === 'skipped' ? '[ ]' : '[✗]';
    const msg = r.message ? ` (${r.message})` : '';
    console.log(`${icon} ${r.provider}${msg}`);
  });

  console.log(`\nValidated: ${validated}, Partial: ${partial}, Skipped: ${skipped}, Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nSome providers failed validation. See errors above.');
    process.exit(1);
  } else if (validated === 0 && partial === 0) {
    console.log('\nNo providers validated (all skipped). Set env vars to validate.');
    process.exit(0);
  } else {
    console.log('\nAll enabled providers validated successfully!');
    process.exit(0);
  }
}

runValidation().catch((error) => {
  console.error('\nValidation harness error:', error);
  process.exit(1);
});
