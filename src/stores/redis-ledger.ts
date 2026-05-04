import type { RedisLike } from './redis';
import type { LedgerStore, LedgerEntry, LedgerQuery } from '../ledger';

export interface RedisLedgerStoreOptions {
  redis: RedisLike;
  keyPrefix?: string;
  maxEntries?: number;
}

export function createRedisLedgerStore(opts: RedisLedgerStoreOptions): LedgerStore {
  const prefix = opts.keyPrefix ?? 'pb:ledger:';
  const maxEntries = opts.maxEntries ?? 100000;
  const listKey = `${prefix}list`;
  const refIndexPrefix = `${prefix}ref:`;

  if (!opts.redis.lpush || !opts.redis.ltrim || !opts.redis.lrange || !opts.redis.sadd || !opts.redis.smembers || !opts.redis.expire) {
    throw new Error('Redis client does not support required list/set operations for ledger store');
  }

  return {
    async append(entry: LedgerEntry): Promise<void> {
      const serialized = JSON.stringify(entry);
      await opts.redis.lpush!(listKey, serialized);
      await opts.redis.ltrim!(listKey, 0, maxEntries - 1);

      if (entry.reference) {
        const refKey = `${refIndexPrefix}${entry.reference}`;
        await opts.redis.sadd!(refKey, entry.id);
        await opts.redis.expire!(refKey, 86400 * 30);
      }
    },

    async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
      let entries: LedgerEntry[] = [];

      if (filter.reference) {
        const refKey = `${refIndexPrefix}${filter.reference}`;
        const ids = await opts.redis.smembers!(refKey);
        if (!ids || ids.length === 0) return [];

        const allEntries = await opts.redis.lrange!(listKey, 0, -1);
        entries = allEntries
          .map((s: string) => JSON.parse(s) as LedgerEntry)
          .filter((e: LedgerEntry) => ids.includes(e.id));
      } else {
        const allEntries = await opts.redis.lrange!(listKey, 0, -1);
        entries = allEntries.map((s: string) => JSON.parse(s) as LedgerEntry);
      }

      if (filter.provider) entries = entries.filter(e => e.provider === filter.provider);
      if (filter.status) entries = entries.filter(e => e.status === filter.status);
      if (filter.fromTimestamp) entries = entries.filter(e => e.timestamp >= filter.fromTimestamp!);
      if (filter.toTimestamp) entries = entries.filter(e => e.timestamp <= filter.toTimestamp!);
      if (filter.limit) entries = entries.slice(0, filter.limit);

      return entries;
    },
  };
}
