export type CanonicalStatus = 'completed' | 'pending' | 'failed' | 'cancelled' | 'refunded' | 'unknown';

export interface ReconcileRecord {
  provider: string;
  reference: string;
  expectedStatus: CanonicalStatus | string;
}

export interface ReconcileResult {
  provider: string;
  reference: string;
  expectedStatus: string;
  actualStatus?: string;
  classification: 'match' | 'mismatch' | 'not-found' | 'error' | 'skipped';
  errorMessage?: string;
}

export interface ReconcileSummary {
  total: number;
  match: number;
  mismatch: number;
  notFound: number;
  error: number;
  skipped: number;
}
