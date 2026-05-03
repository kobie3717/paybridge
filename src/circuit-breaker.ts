/**
 * Circuit breaker for provider failure management.
 * Supports pluggable storage for multi-instance deployments.
 * Not atomic across processes — eventual consistency accepted.
 */

import { CircuitBreakerStore, CircuitBreakerSnapshot, MemoryStore } from './circuit-breaker-store';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  store?: CircuitBreakerStore;
}

export class CircuitBreaker {
  private readonly key: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly store: CircuitBreakerStore;

  constructor(key: string = 'default', config: CircuitBreakerConfig = {}) {
    this.key = key;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30000;
    this.store = config.store ?? new MemoryStore();
  }

  async isOpen(): Promise<boolean> {
    const snapshot = await this.getSnapshot();

    if (snapshot.state === CircuitState.OPEN) {
      if (Date.now() >= snapshot.nextAttemptTime) {
        snapshot.state = CircuitState.HALF_OPEN as 'HALF_OPEN';
        await this.saveSnapshot(snapshot);
        return false;
      }
      return true;
    }
    return false;
  }

  async recordSuccess(): Promise<void> {
    const snapshot: CircuitBreakerSnapshot = {
      state: CircuitState.CLOSED as 'CLOSED',
      failureCount: 0,
      nextAttemptTime: 0,
    };
    await this.saveSnapshot(snapshot);
  }

  async recordFailure(): Promise<void> {
    const snapshot = await this.getSnapshot();
    snapshot.failureCount++;

    if (snapshot.state === CircuitState.HALF_OPEN) {
      snapshot.state = CircuitState.OPEN as 'OPEN';
      snapshot.nextAttemptTime = Date.now() + this.resetTimeoutMs;
      await this.saveSnapshot(snapshot, this.resetTimeoutMs + 5000);
    } else if (snapshot.failureCount >= this.failureThreshold) {
      snapshot.state = CircuitState.OPEN as 'OPEN';
      snapshot.nextAttemptTime = Date.now() + this.resetTimeoutMs;
      await this.saveSnapshot(snapshot, this.resetTimeoutMs + 5000);
    } else {
      await this.saveSnapshot(snapshot);
    }
  }

  async getState(): Promise<CircuitState> {
    const snapshot = await this.getSnapshot();
    return snapshot.state as CircuitState;
  }

  async reset(): Promise<void> {
    const snapshot: CircuitBreakerSnapshot = {
      state: CircuitState.CLOSED as 'CLOSED',
      failureCount: 0,
      nextAttemptTime: 0,
    };
    await this.saveSnapshot(snapshot);
  }

  private async getSnapshot(): Promise<CircuitBreakerSnapshot> {
    const snapshot = await this.store.get(this.key);
    if (snapshot) return snapshot;

    return {
      state: CircuitState.CLOSED as 'CLOSED',
      failureCount: 0,
      nextAttemptTime: 0,
    };
  }

  private async saveSnapshot(snapshot: CircuitBreakerSnapshot, ttlMs?: number): Promise<void> {
    await this.store.set(this.key, snapshot, ttlMs);
  }
}
