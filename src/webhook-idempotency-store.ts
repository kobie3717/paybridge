/**
 * Webhook idempotency storage abstraction
 */

export interface IdempotencyStore {
  recordIfNew(key: string, ttlMs: number): Promise<boolean>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, number>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(opts: { cleanupIntervalMs?: number } = {}) {
    if (opts.cleanupIntervalMs) {
      this.cleanupInterval = setInterval(() => this.cleanup(), opts.cleanupIntervalMs);
      this.cleanupInterval.unref?.();
    }
  }

  async recordIfNew(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.store.get(key);
    if (existing !== undefined && existing > now) {
      return false;
    }
    this.store.set(key, now + ttlMs);
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    this.store.forEach((expiresAt, k) => {
      if (expiresAt <= now) keysToDelete.push(k);
    });
    keysToDelete.forEach(k => this.store.delete(k));
  }

  destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}
