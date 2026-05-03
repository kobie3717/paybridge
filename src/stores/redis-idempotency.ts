/**
 * Redis-backed idempotency store adapter
 */

import type { RedisLike } from './redis';
import type { IdempotencyStore } from '../webhook-idempotency-store';

export interface RedisIdempotencyStoreOptions {
  redis: RedisLike;
  keyPrefix?: string;
}

export function createRedisIdempotencyStore(opts: RedisIdempotencyStoreOptions): IdempotencyStore {
  const prefix = opts.keyPrefix ?? 'pb:idem:';
  return {
    async recordIfNew(key, ttlMs) {
      const result = await opts.redis.set(`${prefix}${key}`, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    },
  };
}
