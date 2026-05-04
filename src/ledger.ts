export interface LedgerEntry {
  id: string;
  timestamp: string;
  operation: 'createPayment' | 'createSubscription' | 'getPayment' | 'refund' | 'createOnRamp' | 'createOffRamp' | 'getRamp' | 'parseWebhook';
  provider: string;
  reference?: string;
  providerId?: string;
  status: 'attempted' | 'success' | 'failed' | 'rate_limited' | 'timeout';
  amount?: number;
  currency?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerQuery {
  reference?: string;
  provider?: string;
  status?: LedgerEntry['status'];
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
}

export interface LedgerStore {
  append(entry: LedgerEntry): Promise<void>;
  query(filter: LedgerQuery): Promise<LedgerEntry[]>;
}

export class InMemoryLedgerStore implements LedgerStore {
  private entries: LedgerEntry[] = [];
  private maxSize: number;

  constructor(opts: { maxSize?: number } = {}) {
    this.maxSize = opts.maxSize ?? 10000;
  }

  async append(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }
  }

  async query(filter: LedgerQuery): Promise<LedgerEntry[]> {
    let results = this.entries;
    if (filter.reference) results = results.filter(e => e.reference === filter.reference);
    if (filter.provider) results = results.filter(e => e.provider === filter.provider);
    if (filter.status) results = results.filter(e => e.status === filter.status);
    if (filter.fromTimestamp) results = results.filter(e => e.timestamp >= filter.fromTimestamp!);
    if (filter.toTimestamp) results = results.filter(e => e.timestamp <= filter.toTimestamp!);
    if (filter.limit) results = results.slice(0, filter.limit);
    return [...results];
  }
}
