import { runners, ProviderRunner } from '../runners';
import { colorize } from '../utils';

interface TestResult {
  provider: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
  data?: {
    id?: string;
    checkoutUrl?: string;
    status?: string;
  };
}

async function runProviderTest(runner: ProviderRunner): Promise<TestResult> {
  const missing = runner.envRequired.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return {
      provider: runner.name,
      status: 'skipped',
      message: `Missing: ${missing.join(', ')}`,
    };
  }

  console.log(`${colorize('[…]', 'cyan')} ${runner.name} - validating...`);

  try {
    const result = await runner.run();

    if (!result.id) {
      throw new Error('No payment ID returned');
    }

    console.log(
      `${colorize('[✓]', 'green')} ${runner.name} → id=${result.id}${
        result.checkoutUrl ? `, url=${result.checkoutUrl.substring(0, 60)}...` : ''
      }, status=${result.status}`
    );

    return {
      provider: runner.name,
      status: 'success',
      data: {
        id: result.id,
        checkoutUrl: result.checkoutUrl,
        status: result.status,
      },
    };
  } catch (error: any) {
    console.log(`${colorize('[✗]', 'red')} ${runner.name} ERROR: ${error.message || String(error)}`);
    return {
      provider: runner.name,
      status: 'failed',
      message: error.message || String(error),
    };
  }
}

export async function runTest(args: string[]): Promise<void> {
  const isAll = args.includes('--all');
  const providerName = args.find((a) => !a.startsWith('--'));

  if (!isAll && !providerName) {
    console.error('Usage: paybridge test <provider> | paybridge test --all');
    process.exit(1);
  }

  console.log('\n=== PayBridge Test ===\n');

  const results: TestResult[] = [];

  if (isAll) {
    for (const runner of runners) {
      const result = await runProviderTest(runner);
      results.push(result);
    }
  } else {
    const runner = runners.find((r) => r.name === providerName);
    if (!runner) {
      console.error(`Unknown provider: ${providerName}`);
      console.error(`Available: ${runners.map((r) => r.name).join(', ')}`);
      process.exit(1);
    }
    const result = await runProviderTest(runner);
    results.push(result);
  }

  console.log('\n=== Summary ===\n');

  const succeeded = results.filter((r) => r.status === 'success').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  results.forEach((r) => {
    const icon =
      r.status === 'success'
        ? colorize('[✓]', 'green')
        : r.status === 'skipped'
        ? colorize('[ ]', 'dim')
        : colorize('[✗]', 'red');
    const msg = r.message ? ` (${r.message})` : '';
    console.log(`${icon} ${r.provider}${msg}`);
  });

  console.log(`\nSucceeded: ${succeeded}, Skipped: ${skipped}, Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nSome providers failed validation.');
    process.exit(1);
  } else if (succeeded === 0) {
    console.log('\nNo providers validated (all skipped). Set env vars to validate.');
    process.exit(0);
  } else {
    console.log('\nAll enabled providers validated successfully!');
    process.exit(0);
  }
}
