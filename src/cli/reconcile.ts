import { PayBridge } from '../index';
import { ReconcileRecord, ReconcileResult, ReconcileSummary } from './reconcile-types';

export interface ReconcileDeps {
  buildProvider: (providerName: string) => PayBridge;
  hasCredsFor: (providerName: string) => boolean;
}

export async function runReconcile(
  records: ReconcileRecord[],
  deps: ReconcileDeps,
  opts: { onResult?: (r: ReconcileResult) => void } = {}
): Promise<{ results: ReconcileResult[]; summary: ReconcileSummary }> {
  const providerCache = new Map<string, PayBridge>();
  const results: ReconcileResult[] = [];

  const summary: ReconcileSummary = {
    total: records.length,
    match: 0,
    mismatch: 0,
    notFound: 0,
    error: 0,
    skipped: 0,
  };

  for (const record of records) {
    if (!deps.hasCredsFor(record.provider)) {
      const result: ReconcileResult = {
        provider: record.provider,
        reference: record.reference,
        expectedStatus: record.expectedStatus,
        classification: 'skipped',
        errorMessage: 'missing credentials',
      };
      results.push(result);
      summary.skipped++;
      opts.onResult?.(result);
      continue;
    }

    let pay: PayBridge;
    if (providerCache.has(record.provider)) {
      pay = providerCache.get(record.provider)!;
    } else {
      try {
        pay = deps.buildProvider(record.provider);
        providerCache.set(record.provider, pay);
      } catch (err: any) {
        const result: ReconcileResult = {
          provider: record.provider,
          reference: record.reference,
          expectedStatus: record.expectedStatus,
          classification: 'error',
          errorMessage: err.message || String(err),
        };
        results.push(result);
        summary.error++;
        opts.onResult?.(result);
        continue;
      }
    }

    try {
      const payment = await pay.getPayment(record.reference);
      const actualStatus = payment.status;

      const normalized = normalizeStatus(record.expectedStatus);
      const match = normalized === actualStatus;

      const result: ReconcileResult = {
        provider: record.provider,
        reference: record.reference,
        expectedStatus: record.expectedStatus,
        actualStatus,
        classification: match ? 'match' : 'mismatch',
      };
      results.push(result);

      if (match) {
        summary.match++;
      } else {
        summary.mismatch++;
      }
      opts.onResult?.(result);
    } catch (err: any) {
      const isNotFound =
        err.message?.includes('not found') ||
        err.message?.includes('404') ||
        err.message?.includes('No payment found');

      const result: ReconcileResult = {
        provider: record.provider,
        reference: record.reference,
        expectedStatus: record.expectedStatus,
        classification: isNotFound ? 'not-found' : 'error',
        errorMessage: err.message || String(err),
      };
      results.push(result);

      if (isNotFound) {
        summary.notFound++;
      } else {
        summary.error++;
      }
      opts.onResult?.(result);
    }
  }

  return { results, summary };
}

function normalizeStatus(status: string): string {
  const lower = status.toLowerCase();
  if (['completed', 'pending', 'failed', 'cancelled', 'refunded'].includes(lower)) {
    return lower;
  }
  return 'unknown';
}
