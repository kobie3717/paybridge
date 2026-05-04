#!/usr/bin/env node

import { runTest } from './commands/test';
import { runProviders } from './commands/providers';
import { runWebhook } from './commands/webhook';
import { runQuote } from './commands/quote';
import { printHelp, printVersion } from './utils';

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'test':
      await runTest(args);
      break;
    case 'providers':
      await runProviders(args);
      break;
    case 'webhook':
      await runWebhook(args);
      break;
    case 'quote':
      await runQuote(args);
      break;
    case '-h':
    case '--help':
    case 'help':
    case undefined:
      printHelp();
      process.exit(0);
      break;
    case '-v':
    case '--version':
      printVersion();
      process.exit(0);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp(true);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
