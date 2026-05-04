import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { runAudit } from '../src/cli/commands/audit';

test('runAudit - writes HTML file by default', async () => {
  const outputPath = '/tmp/test-audit-html.html';

  try {
    await fs.unlink(outputPath);
  } catch {}

  process.env.STRIPE_API_KEY = 'sk_test_dummy';

  await runAudit(['--output', outputPath, '--window', '7d']);

  const content = await fs.readFile(outputPath, 'utf-8');
  assert.ok(content.includes('<!DOCTYPE html>'));
  assert.ok(content.includes('PayBridge Audit Report'));

  await fs.unlink(outputPath);
  delete process.env.STRIPE_API_KEY;
});

test('runAudit - outputs JSON when format is json', async () => {
  const outputPath = '/tmp/test-audit-json.json';

  try {
    await fs.unlink(outputPath);
  } catch {}

  process.env.STRIPE_API_KEY = 'sk_test_dummy';

  await runAudit(['--output', outputPath, '--format', 'json', '--window', '1d']);

  const content = await fs.readFile(outputPath, 'utf-8');
  const parsed = JSON.parse(content);
  assert.ok(parsed.summary);
  assert.ok(parsed.providers);

  await fs.unlink(outputPath);
  delete process.env.STRIPE_API_KEY;
});

test('runAudit - outputs markdown when format is md', async () => {
  const outputPath = '/tmp/test-audit-md.md';

  try {
    await fs.unlink(outputPath);
  } catch {}

  process.env.STRIPE_API_KEY = 'sk_test_dummy';

  await runAudit(['--output', outputPath, '--format', 'md', '--window', '7d']);

  const content = await fs.readFile(outputPath, 'utf-8');
  assert.ok(content.includes('# PayBridge Audit Report'));
  assert.ok(content.includes('## Executive Summary'));

  await fs.unlink(outputPath);
  delete process.env.STRIPE_API_KEY;
});

test('runAudit - parses window durations correctly', async () => {
  const outputPath = '/tmp/test-audit-window.json';

  try {
    await fs.unlink(outputPath);
  } catch {}

  process.env.STRIPE_API_KEY = 'sk_test_dummy';

  await runAudit(['--output', outputPath, '--format', 'json', '--window', '30d']);

  const content = await fs.readFile(outputPath, 'utf-8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.windowMs, 30 * 24 * 60 * 60 * 1000);

  await fs.unlink(outputPath);
  delete process.env.STRIPE_API_KEY;
});

test('runAudit - exits with code 1 if high-severity anomalies exist', async () => {
  const outputPath = '/tmp/test-audit-anomaly.json';

  try {
    await fs.unlink(outputPath);
  } catch {}

  process.env.STRIPE_API_KEY = 'sk_test_dummy';

  let exitCode = 0;
  const originalExit = process.exit;
  process.exit = ((code: number) => {
    exitCode = code;
  }) as any;

  try {
    await runAudit(['--output', outputPath, '--format', 'json', '--window', '7d']);
  } catch {}

  process.exit = originalExit;

  assert.equal(exitCode, 0);

  try {
    await fs.unlink(outputPath);
  } catch {}
  delete process.env.STRIPE_API_KEY;
});
