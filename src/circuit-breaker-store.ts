/**
 * Circuit breaker storage abstraction
 */

export interface CircuitBreakerSnapshot {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  nextAttemptTime: number;
}

/**
 * Storage interface for circuit breaker state.
 * TTL is advisory — in-memory stores may ignore it, Redis-backed stores use it for expiry.
 */
export interface CircuitBreakerStore {
  get(key: string): Promise<CircuitBreakerSnapshot | null>;
  set(key: string, snapshot: CircuitBreakerSnapshot, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory circuit breaker store.
 * Each process instance has its own isolated state.
 */
export class MemoryStore implements CircuitBreakerStore {
  private map = new Map<string, CircuitBreakerSnapshot>();

  async get(key: string): Promise<CircuitBreakerSnapshot | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, snapshot: CircuitBreakerSnapshot): Promise<void> {
    this.map.set(key, snapshot);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}
