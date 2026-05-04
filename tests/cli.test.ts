import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';

const CLI_PATH = path.join(__dirname, '../../dist/cli/index.js');

function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

test('CLI: help command prints usage', async () => {
  const result = await runCLI(['--help']);
  assert.strictEqual(result.exitCode, 0);
  assert.match(result.stdout, /USAGE/);
  assert.match(result.stdout, /COMMANDS/);
  assert.match(result.stdout, /providers/);
  assert.match(result.stdout, /test/);
  assert.match(result.stdout, /webhook/);
  assert.match(result.stdout, /quote/);
});

test('CLI: version flag prints version', async () => {
  const result = await runCLI(['--version']);
  assert.strictEqual(result.exitCode, 0);
  assert.match(result.stdout, /paybridge v\d+\.\d+\.\d+/);
});

test('CLI: providers command runs without error', async () => {
  const result = await runCLI(['providers']);
  assert.strictEqual(result.exitCode, 0);
  assert.match(result.stdout, /FIAT PROVIDERS/);
  assert.match(result.stdout, /CRYPTO PROVIDERS/);
  assert.match(result.stdout, /softycomp/);
  assert.match(result.stdout, /moonpay/);
});

test('CLI: providers --json outputs JSON', async () => {
  const result = await runCLI(['providers', '--json']);
  assert.strictEqual(result.exitCode, 0);
  const data = JSON.parse(result.stdout);
  assert.ok(Array.isArray(data.fiat));
  assert.ok(Array.isArray(data.crypto));
  assert.ok(data.fiat.length > 0);
  assert.ok(data.crypto.length > 0);
});

test('CLI: test with unknown provider exits with error', async () => {
  const result = await runCLI(['test', 'unknown-provider']);
  assert.notStrictEqual(result.exitCode, 0);
  assert.match(result.stderr, /Unknown provider/);
});

test('CLI: test softycomp without env vars skips', async () => {
  const env = { ...process.env };
  delete env.SOFTYCOMP_API_KEY;
  delete env.SOFTYCOMP_SECRET_KEY;

  const proc = spawn('node', [CLI_PATH, 'test', 'softycomp'], { env });
  let stdout = '';

  proc.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on('close', resolve);
  });

  assert.strictEqual(exitCode, 0);
  assert.match(stdout, /skipped/i);
  assert.match(stdout, /Missing:/);
});

test('CLI: unknown command shows error and help', async () => {
  const result = await runCLI(['invalid-command']);
  assert.notStrictEqual(result.exitCode, 0);
  assert.match(result.stderr, /Unknown command/);
  assert.match(result.stderr, /USAGE/);
});
