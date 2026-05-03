/**
 * Redis-backed circuit breaker store adapter
 */

import { CircuitBreakerStore, CircuitBreakerSnapshot } from '../circuit-breaker-store';

/**
 * Duck-typed Redis client interface.
 * Compatible with both ioredis and node-redis v4+.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(key: string): Promise<any>;
}

export interface RedisStoreOptions {
  prefix?: string;
}

/**
 * Create a Redis-backed circuit breaker store.
 * Works with ioredis and node-redis v4+ (duck-types get/set/del).
 *
 * @example
 * ```ts
 * import Redis from 'ioredis';
 * import { createRedisCircuitBreakerStore } from 'paybridge';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const store = createRedisCircuitBreakerStore(redis, { prefix: 'app:cb:' });
 * ```
 */
export function createRedisCircuitBreakerStore(
  client: RedisLike,
  options: RedisStoreOptions = {}
): CircuitBreakerStore {
  const prefix = options.prefix ?? 'paybridge:cb:';

  return {
    async get(key: string): Promise<CircuitBreakerSnapshot | null> {
      const raw = await client.get(prefix + key);
      if (!raw) return null;
      return JSON.parse(raw);
    },

    async set(key: string, snapshot: CircuitBreakerSnapshot, ttlMs?: number): Promise<void> {
      const value = JSON.stringify(snapshot);
      if (ttlMs !== undefined) {
        await client.set(prefix + key, value, 'PX', ttlMs);
      } else {
        await client.set(prefix + key, value);
      }
    },

    async delete(key: string): Promise<void> {
      await client.del(prefix + key);
    },
  };
}
