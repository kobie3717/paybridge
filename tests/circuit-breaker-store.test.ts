/**
 * Circuit breaker store tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CircuitBreaker, CircuitState, MemoryStore, createRedisCircuitBreakerStore } from '../src';
import type { RedisLike } from '../src';

describe('MemoryStore', () => {
  it('should set and get snapshot', async () => {
    const store = new MemoryStore();
    const snapshot = {
      state: CircuitState.OPEN,
      failureCount: 3,
      nextAttemptTime: Date.now() + 30000,
    };

    await store.set('test-key', snapshot);
    const retrieved = await store.get('test-key');

    assert.deepStrictEqual(retrieved, snapshot);
  });

  it('should return null for missing key', async () => {
    const store = new MemoryStore();
    const result = await store.get('nonexistent');
    assert.strictEqual(result, null);
  });

  it('should delete keys', async () => {
    const store = new MemoryStore();
    const snapshot = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      nextAttemptTime: 0,
    };

    await store.set('test-key', snapshot);
    await store.delete('test-key');
    const result = await store.get('test-key');

    assert.strictEqual(result, null);
  });
});

describe('CircuitBreaker with shared MemoryStore', () => {
  it('should share state across instances with same key', async () => {
    const store = new MemoryStore();
    const breakerA = new CircuitBreaker('shared-provider', { store, failureThreshold: 2 });
    const breakerB = new CircuitBreaker('shared-provider', { store, failureThreshold: 2 });

    await breakerA.recordFailure();
    await breakerA.recordFailure();

    assert.strictEqual(await breakerA.isOpen(), true);
    assert.strictEqual(await breakerB.isOpen(), true);
  });

  it('should isolate state when no store provided', async () => {
    const breakerA = new CircuitBreaker('provider', { failureThreshold: 2 });
    const breakerB = new CircuitBreaker('provider', { failureThreshold: 2 });

    await breakerA.recordFailure();
    await breakerA.recordFailure();

    assert.strictEqual(await breakerA.isOpen(), true);
    assert.strictEqual(await breakerB.isOpen(), false);
  });
});

describe('RedisStore with fake client', () => {
  it('should serialize and deserialize snapshots', async () => {
    const storage = new Map<string, string>();
    const fakeRedis: RedisLike = {
      async get(key: string) {
        return storage.get(key) ?? null;
      },
      async set(key: string, value: string) {
        storage.set(key, value);
      },
      async del(key: string) {
        storage.delete(key);
      },
    };

    const store = createRedisCircuitBreakerStore(fakeRedis, { prefix: 'test:' });
    const snapshot = {
      state: CircuitState.OPEN,
      failureCount: 5,
      nextAttemptTime: Date.now() + 10000,
    };

    await store.set('provider-x', snapshot);
    const retrieved = await store.get('provider-x');

    assert.deepStrictEqual(retrieved, snapshot);
    assert.ok(storage.has('test:provider-x'));
  });

  it('should pass TTL to client.set via PX flag', async () => {
    let capturedArgs: any[] = [];

    const fakeRedis: RedisLike = {
      async get() {
        return null;
      },
      async set(...args: any[]) {
        capturedArgs = args;
      },
      async del() {},
    };

    const store = createRedisCircuitBreakerStore(fakeRedis, { prefix: 'app:' });
    const snapshot = {
      state: CircuitState.OPEN,
      failureCount: 3,
      nextAttemptTime: Date.now() + 30000,
    };

    await store.set('provider-y', snapshot, 35000);

    assert.strictEqual(capturedArgs[0], 'app:provider-y');
    assert.strictEqual(typeof capturedArgs[1], 'string');
    assert.strictEqual(capturedArgs[2], 'PX');
    assert.strictEqual(capturedArgs[3], 35000);
  });

  it('should return null when client returns null', async () => {
    const fakeRedis: RedisLike = {
      async get() {
        return null;
      },
      async set() {},
      async del() {},
    };

    const store = createRedisCircuitBreakerStore(fakeRedis);
    const result = await store.get('missing-key');

    assert.strictEqual(result, null);
  });

  it('should delete keys with prefix', async () => {
    const storage = new Map<string, string>();
    const fakeRedis: RedisLike = {
      async get(key: string) {
        return storage.get(key) ?? null;
      },
      async set(key: string, value: string) {
        storage.set(key, value);
      },
      async del(key: string) {
        storage.delete(key);
      },
    };

    const store = createRedisCircuitBreakerStore(fakeRedis, { prefix: 'myapp:' });
    const snapshot = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      nextAttemptTime: 0,
    };

    await store.set('test-key', snapshot);
    assert.ok(storage.has('myapp:test-key'));

    await store.delete('test-key');
    assert.ok(!storage.has('myapp:test-key'));
  });
});

describe('CircuitBreaker state transitions', () => {
  it('should transition CLOSED -> OPEN after threshold failures', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3 });

    assert.strictEqual(await breaker.getState(), CircuitState.CLOSED);

    await breaker.recordFailure();
    await breaker.recordFailure();
    assert.strictEqual(await breaker.isOpen(), false);

    await breaker.recordFailure();
    assert.strictEqual(await breaker.isOpen(), true);
    assert.strictEqual(await breaker.getState(), CircuitState.OPEN);
  });

  it('should transition OPEN -> HALF_OPEN after timeout', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 50 });

    await breaker.recordFailure();
    assert.strictEqual(await breaker.isOpen(), true);

    await new Promise(resolve => setTimeout(resolve, 60));

    assert.strictEqual(await breaker.isOpen(), false);
    assert.strictEqual(await breaker.getState(), CircuitState.HALF_OPEN);
  });

  it('should reset to CLOSED on success', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 2 });

    await breaker.recordFailure();
    await breaker.recordFailure();
    assert.strictEqual(await breaker.isOpen(), true);

    await breaker.recordSuccess();
    assert.strictEqual(await breaker.isOpen(), false);
    assert.strictEqual(await breaker.getState(), CircuitState.CLOSED);
  });
});
