export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

export function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

export function padEnd(str: string, length: number): string {
  while (str.length < length) {
    str += ' ';
  }
  return str;
}

export function formatTable(rows: string[][], padding = 2): string {
  if (rows.length === 0) return '';

  const colWidths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i] || 0, cell.length);
    });
  }

  return rows
    .map((row) =>
      row.map((cell, i) => padEnd(cell, colWidths[i])).join(' '.repeat(padding))
    )
    .join('\n');
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseHeaders(headerFlags: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const flag of headerFlags) {
    const [key, ...valueParts] = flag.split('=');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join('=').trim();
    }
  }
  return headers;
}

export function printHelp(toStderr = false): void {
  const output = `
paybridge — unified payment SDK CLI

USAGE
  paybridge <command> [options]

COMMANDS
  test <provider>         Run sandbox createPayment validation for a provider
  test --all              Run validation for every provider with env vars set
  providers [--json]      List all providers with capabilities (table or JSON)
  webhook verify <p>      Verify webhook signature (raw body from stdin)
  webhook parse <p>       Parse webhook event (raw body from stdin)
  quote <p> [opts]        Get a crypto on/off-ramp quote
  help, -h, --help        Print this help
  version, -v             Print version

PROVIDER ENV VARS
  See SETUP.md or run 'paybridge test --all' for the full list.

EXAMPLES
  paybridge providers
  paybridge test stripe
  STRIPE_API_KEY=sk_test_... paybridge test stripe
  echo '{"id":"evt_x"}' | paybridge webhook parse paystack \\
    --header x-paystack-signature=abc

Docs: https://github.com/kobie3717/paybridge
`.trim();

  if (toStderr) {
    console.error(output);
  } else {
    console.log(output);
  }
}

export function printVersion(): void {
  const pkg = require('../../package.json');
  console.log(`paybridge v${pkg.version}`);
}
