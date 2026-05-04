import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileDriftStore } from '../src/cli/drift-store';
import { runDriftCheck } from '../src/cli/commands/drift';
import { ProviderRunner } from '../src/cli/runners';
import { captureShape } from '../src/drift-detector';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybridge-drift-'));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const mockRunner: ProviderRunner = {
  name: 'mock-provider',
  envRequired: [],
  run: async () => ({
    id: 'pay_123',
    checkoutUrl: 'https://example.com/checkout',
    status: 'pending',
  }),
};

const mockRunnerWithEnv: ProviderRunner = {
  name: 'mock-with-env',
  envRequired: ['MOCK_API_KEY'],
  run: async () => ({
    id: 'pay_456',
    status: 'completed',
  }),
};

describe('drift-check CLI', () => {
  it('--capture mode saves baseline file', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const results = await runDriftCheck([mockRunner], store, { capture: true });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'captured');
      assert.strictEqual(results[0].provider, 'mock-provider');
      assert.ok(results[0].keyCount && results[0].keyCount > 0);

      const baseline = await store.load('mock-provider');
      assert.ok(baseline);
      assert.strictEqual(baseline.providerName, 'mock-provider');
      assert.strictEqual(baseline.operation, 'createPayment');
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('returns no-baseline when baseline missing', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const results = await runDriftCheck([mockRunner], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'no-baseline');
      assert.strictEqual(results[0].provider, 'mock-provider');
      assert.ok(results[0].message);
      assert.ok(results[0].message.includes('No baseline found'));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('returns no-drift when baseline matches', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      await runDriftCheck([mockRunner], store, { capture: true });

      const results = await runDriftCheck([mockRunner], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'no-drift');
      assert.strictEqual(results[0].provider, 'mock-provider');
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('returns drift when response shape diverges', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      await runDriftCheck([mockRunner], store, { capture: true });

      const mutatedRunner: ProviderRunner = {
        name: 'mock-provider',
        envRequired: [],
        run: async () => ({
          id: 'pay_789',
          checkoutUrl: 'https://example.com/checkout',
          status: 'pending',
          newField: 'appeared',
        }),
      };

      const results = await runDriftCheck([mutatedRunner], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'drift');
      assert.strictEqual(results[0].provider, 'mock-provider');
      assert.ok(results[0].report);
      assert.ok(results[0].report.driftDetected);
      assert.ok(results[0].report.addedKeys.includes('newField'));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('skips providers with missing env vars', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const results = await runDriftCheck([mockRunnerWithEnv], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'skipped');
      assert.strictEqual(results[0].provider, 'mock-with-env');
      assert.ok(results[0].message);
      assert.ok(results[0].message.includes('Missing: MOCK_API_KEY'));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('handles runner errors gracefully', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const errorRunner: ProviderRunner = {
        name: 'error-provider',
        envRequired: [],
        run: async () => {
          throw new Error('Network timeout');
        },
      };

      const results = await runDriftCheck([errorRunner], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'error');
      assert.strictEqual(results[0].provider, 'error-provider');
      assert.ok(results[0].message);
      assert.ok(results[0].message.includes('Network timeout'));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('detects type changes', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const originalRunner: ProviderRunner = {
        name: 'type-change-provider',
        envRequired: [],
        run: async () => ({
          id: 'pay_123',
          amount: '100',
          status: 'pending',
        }),
      };

      await runDriftCheck([originalRunner], store, { capture: true });

      const mutatedRunner: ProviderRunner = {
        name: 'type-change-provider',
        envRequired: [],
        run: async () => ({
          id: 'pay_456',
          amount: 100,
          status: 'pending',
        }),
      };

      const results = await runDriftCheck([mutatedRunner], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'drift');
      assert.ok(results[0].report);
      assert.strictEqual(results[0].report.typeChanges.length, 1);
      assert.strictEqual(results[0].report.typeChanges[0].key, 'amount');
      assert.strictEqual(results[0].report.typeChanges[0].oldType, 'string');
      assert.strictEqual(results[0].report.typeChanges[0].newType, 'number');
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('detects removed keys', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const originalRunner: ProviderRunner = {
        name: 'removal-provider',
        envRequired: [],
        run: async () => ({
          id: 'pay_123',
          legacyField: 'old',
          status: 'pending',
        }),
      };

      await runDriftCheck([originalRunner], store, { capture: true });

      const mutatedRunner: ProviderRunner = {
        name: 'removal-provider',
        envRequired: [],
        run: async () => ({
          id: 'pay_456',
          status: 'pending',
        }),
      };

      const results = await runDriftCheck([mutatedRunner], store, {});

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'drift');
      assert.ok(results[0].report);
      assert.ok(results[0].report.removedKeys.includes('legacyField'));
    } finally {
      cleanupDir(tempDir);
    }
  });
});
