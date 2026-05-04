import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileDriftStore } from '../src/cli/drift-store';
import { ProviderBaseline, captureShape } from '../src/drift-detector';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybridge-drift-'));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('FileDriftStore', () => {
  it('save then load round-trips correctly', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const baseline: ProviderBaseline = {
        providerName: 'stripe',
        operation: 'createPayment',
        shape: captureShape({ id: '123', status: 'pending' }),
        libVersion: '0.10.0',
      };

      await store.save(baseline);

      const loaded = await store.load('stripe');

      assert.ok(loaded);
      assert.strictEqual(loaded.providerName, 'stripe');
      assert.strictEqual(loaded.operation, 'createPayment');
      assert.strictEqual(loaded.libVersion, '0.10.0');
      assert.deepStrictEqual(loaded.shape.keys, baseline.shape.keys);
      assert.deepStrictEqual(loaded.shape.types, baseline.shape.types);
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('load returns null for unknown provider', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const loaded = await store.load('nonexistent');

      assert.strictEqual(loaded, null);
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('listProviders returns all stored baselines', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const baseline1: ProviderBaseline = {
        providerName: 'stripe',
        operation: 'createPayment',
        shape: captureShape({ id: '1' }),
        libVersion: '0.10.0',
      };

      const baseline2: ProviderBaseline = {
        providerName: 'mollie',
        operation: 'createPayment',
        shape: captureShape({ id: '2' }),
        libVersion: '0.10.0',
      };

      await store.save(baseline1);
      await store.save(baseline2);

      const providers = await store.listProviders();

      assert.strictEqual(providers.length, 2);
      assert.ok(providers.includes('stripe'));
      assert.ok(providers.includes('mollie'));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('listProviders returns empty array when directory does not exist', async () => {
    const tempDir = path.join(os.tmpdir(), 'paybridge-nonexistent-' + Date.now());

    const store = new FileDriftStore(tempDir);
    const providers = await store.listProviders();

    assert.deepStrictEqual(providers, []);
  });

  it('save overwrites prior baseline', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const baseline1: ProviderBaseline = {
        providerName: 'yoco',
        operation: 'createPayment',
        shape: captureShape({ id: '1', oldField: 'old' }),
        libVersion: '0.9.0',
      };

      await store.save(baseline1);

      const baseline2: ProviderBaseline = {
        providerName: 'yoco',
        operation: 'createPayment',
        shape: captureShape({ id: '2', newField: 'new' }),
        libVersion: '0.10.0',
      };

      await store.save(baseline2);

      const loaded = await store.load('yoco');

      assert.ok(loaded);
      assert.strictEqual(loaded.libVersion, '0.10.0');
      assert.ok(loaded.shape.keys.includes('newField'));
      assert.ok(!loaded.shape.keys.includes('oldField'));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('creates directory if it does not exist', async () => {
    const tempDir = path.join(os.tmpdir(), 'paybridge-new-' + Date.now());

    try {
      const store = new FileDriftStore(tempDir);

      const baseline: ProviderBaseline = {
        providerName: 'paystack',
        operation: 'createPayment',
        shape: captureShape({ id: '1' }),
        libVersion: '0.10.0',
      };

      await store.save(baseline);

      assert.ok(fs.existsSync(tempDir));
      assert.ok(fs.existsSync(path.join(tempDir, 'paystack.json')));
    } finally {
      cleanupDir(tempDir);
    }
  });

  it('stores human-readable JSON', async () => {
    const tempDir = makeTempDir();

    try {
      const store = new FileDriftStore(tempDir);

      const baseline: ProviderBaseline = {
        providerName: 'ozow',
        operation: 'createPayment',
        shape: captureShape({ id: '123' }),
        libVersion: '0.10.0',
      };

      await store.save(baseline);

      const filePath = path.join(tempDir, 'ozow.json');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(content.includes('\n'));
      assert.ok(content.includes('  '));

      const parsed = JSON.parse(content);
      assert.strictEqual(parsed.providerName, 'ozow');
    } finally {
      cleanupDir(tempDir);
    }
  });
});
