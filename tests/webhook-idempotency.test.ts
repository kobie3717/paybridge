import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { InMemoryIdempotencyStore } from '../src/webhook-idempotency-store';

describe('InMemoryIdempotencyStore', () => {
  it('returns true for first call with new key', async () => {
    const store = new InMemoryIdempotencyStore();
    const result = await store.recordIfNew('event-1', 1000);
    assert.strictEqual(result, true);
    store.destroy();
  });

  it('returns false for second call with same key within TTL', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.recordIfNew('event-1', 1000);
    const result = await store.recordIfNew('event-1', 1000);
    assert.strictEqual(result, false);
    store.destroy();
  });

  it('returns true again after TTL expires', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.recordIfNew('event-1', 50);
    await new Promise(resolve => setTimeout(resolve, 60));
    const result = await store.recordIfNew('event-1', 1000);
    assert.strictEqual(result, true);
    store.destroy();
  });

  it('cleanup removes expired entries', async () => {
    const store = new InMemoryIdempotencyStore({ cleanupIntervalMs: 50 });
    await store.recordIfNew('event-1', 30);
    await store.recordIfNew('event-2', 1000);
    await new Promise(resolve => setTimeout(resolve, 100));
    const result1 = await store.recordIfNew('event-1', 1000);
    const result2 = await store.recordIfNew('event-2', 1000);
    assert.strictEqual(result1, true);
    assert.strictEqual(result2, false);
    store.destroy();
  });

  it('cleanup interval does not leave timers running', async () => {
    const store = new InMemoryIdempotencyStore({ cleanupIntervalMs: 10000 });
    store.destroy();
  });

  it('handles multiple different keys independently', async () => {
    const store = new InMemoryIdempotencyStore();
    const result1 = await store.recordIfNew('event-1', 1000);
    const result2 = await store.recordIfNew('event-2', 1000);
    const result3 = await store.recordIfNew('event-1', 1000);
    assert.strictEqual(result1, true);
    assert.strictEqual(result2, true);
    assert.strictEqual(result3, false);
    store.destroy();
  });
});
