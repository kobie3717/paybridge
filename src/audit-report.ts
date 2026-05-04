import type { LedgerStore, LedgerEntry } from './ledger';
import type { DriftStore } from './cli/drift-store';
import type { ProviderCapabilities } from './routing-types';
import type { ReconcileResult } from './cli/reconcile-types';

export interface AuditInput {
  providers: Array<{ name: string; capabilities: ProviderCapabilities }>;
  windowMs?: number;
  ledger?: LedgerStore;
  driftStore?: DriftStore;
  reconcileResults?: ReconcileResult[];
  generatedAt?: string;
}

export interface ProviderAuditSection {
  name: string;
  region?: string;
  totalAttempts: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  failureCount: number;
  rateLimitedCount: number;
  timeoutCount: number;
  estimatedFeesPaid: number;
  estimatedFeeCurrency: string;
  driftEvents: Array<{ at: string; summary: string }>;
  anomalies: AuditAnomaly[];
}

export type AuditAnomaly =
  | { type: 'success_rate_drop'; severity: 'low' | 'medium' | 'high'; description: string; previousRate: number; currentRate: number }
  | { type: 'drift_detected'; severity: 'medium'; description: string; detectedAt: string }
  | { type: 'consecutive_failures'; severity: 'high'; description: string; count: number }
  | { type: 'high_latency'; severity: 'low' | 'medium' | 'high'; description: string; p95Ms: number }
  | { type: 'pii_in_raw'; severity: 'high'; description: string; field: string };

export interface AuditReport {
  generatedAt: string;
  windowMs: number;
  windowStart: string;
  windowEnd: string;
  summary: {
    totalProviders: number;
    totalAttempts: number;
    overallSuccessRate: number | null;
    totalEstimatedFees: number;
    totalEstimatedFeesCurrency: string;
    anomalyCounts: { high: number; medium: number; low: number };
    missedWebhookCount: number;
  };
  providers: ProviderAuditSection[];
  reconciliation?: {
    total: number;
    match: number;
    mismatch: number;
    notFound: number;
    error: number;
    mismatches: Array<{ provider: string; reference: string; expected: string; actual: string }>;
  };
  complianceFlags: Array<{ provider: string; finding: string; severity: 'high' | 'medium' | 'low' }>;
}

const PII_KEYS = ['email', 'card_number', 'iban', 'phone', 'id_number', 'ssn', 'passport', 'cvv', 'tax_id'];

export async function generateAuditReport(input: AuditInput): Promise<AuditReport> {
  const windowMs = input.windowMs ?? 7 * 24 * 60 * 60 * 1000;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const windowEnd = generatedAt;
  const windowStart = new Date(new Date(generatedAt).getTime() - windowMs).toISOString();

  const providerSections: ProviderAuditSection[] = [];
  const complianceFlags: Array<{ provider: string; finding: string; severity: 'high' | 'medium' | 'low' }> = [];

  let totalAttempts = 0;
  let totalSuccess = 0;
  let totalFees = 0;
  let feeCurrencies = new Set<string>();

  for (const providerMeta of input.providers) {
    const { name, capabilities } = providerMeta;

    let entries: LedgerEntry[] = [];
    if (input.ledger) {
      entries = await input.ledger.query({
        provider: name,
        fromTimestamp: windowStart,
        toTimestamp: windowEnd,
      });
    }

    const totalProviderAttempts = entries.length;
    const successCount = entries.filter((e) => e.status === 'success').length;
    const failureCount = entries.filter((e) => e.status === 'failed').length;
    const rateLimitedCount = entries.filter((e) => e.status === 'rate_limited').length;
    const timeoutCount = entries.filter((e) => e.status === 'timeout').length;

    const successRate = totalProviderAttempts > 0 ? successCount / totalProviderAttempts : null;

    const durations = entries
      .filter((e) => e.durationMs !== undefined && e.durationMs !== null)
      .map((e) => e.durationMs!);
    const avgLatencyMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const p95LatencyMs = calculateP95(durations);

    const successfulEntries = entries.filter((e) => e.status === 'success' && e.amount !== undefined);
    let estimatedFeesPaid = 0;
    for (const entry of successfulEntries) {
      const amount = entry.amount!;
      const fee = capabilities.fees.fixed + (amount * capabilities.fees.percent) / 100;
      estimatedFeesPaid += fee;
    }

    feeCurrencies.add(capabilities.fees.currency);
    totalFees += estimatedFeesPaid;

    const driftEvents: Array<{ at: string; summary: string }> = [];
    if (input.driftStore) {
      const baseline = await input.driftStore.load(name);
      if (baseline && baseline.shape.capturedAt) {
        const capturedTime = new Date(baseline.shape.capturedAt).getTime();
        const windowStartTime = new Date(windowStart).getTime();
        if (capturedTime >= windowStartTime) {
          driftEvents.push({
            at: baseline.shape.capturedAt,
            summary: `Baseline snapshot captured for ${baseline.operation}`,
          });
        }
      }
    }

    const anomalies: AuditAnomaly[] = [];

    if (totalProviderAttempts > 0) {
      const halfWindow = windowMs / 2;
      const midpoint = new Date(new Date(windowStart).getTime() + halfWindow).toISOString();

      const previousEntries = entries.filter((e) => e.timestamp < midpoint);
      const currentEntries = entries.filter((e) => e.timestamp >= midpoint);

      if (previousEntries.length >= 20 && currentEntries.length >= 20) {
        const previousSuccessRate = previousEntries.filter((e) => e.status === 'success').length / previousEntries.length;
        const currentSuccessRate = currentEntries.filter((e) => e.status === 'success').length / currentEntries.length;
        const drop = previousSuccessRate - currentSuccessRate;

        if (drop >= 0.30) {
          anomalies.push({
            type: 'success_rate_drop',
            severity: 'high',
            description: `Success rate dropped by ${(drop * 100).toFixed(1)}% in recent window`,
            previousRate: previousSuccessRate,
            currentRate: currentSuccessRate,
          });
        } else if (drop >= 0.20) {
          anomalies.push({
            type: 'success_rate_drop',
            severity: 'medium',
            description: `Success rate dropped by ${(drop * 100).toFixed(1)}% in recent window`,
            previousRate: previousSuccessRate,
            currentRate: currentSuccessRate,
          });
        } else if (drop >= 0.10) {
          anomalies.push({
            type: 'success_rate_drop',
            severity: 'low',
            description: `Success rate dropped by ${(drop * 100).toFixed(1)}% in recent window`,
            previousRate: previousSuccessRate,
            currentRate: currentSuccessRate,
          });
        }
      }

      const consecutiveFailures = detectConsecutiveFailures(entries);
      if (consecutiveFailures >= 3) {
        anomalies.push({
          type: 'consecutive_failures',
          severity: 'high',
          description: `${consecutiveFailures} consecutive failures detected`,
          count: consecutiveFailures,
        });
      }

      if (p95LatencyMs !== null) {
        if (p95LatencyMs > 10000) {
          anomalies.push({
            type: 'high_latency',
            severity: 'high',
            description: `p95 latency ${p95LatencyMs.toFixed(0)}ms exceeds 10s threshold`,
            p95Ms: p95LatencyMs,
          });
        } else if (p95LatencyMs > 5000) {
          anomalies.push({
            type: 'high_latency',
            severity: 'medium',
            description: `p95 latency ${p95LatencyMs.toFixed(0)}ms exceeds 5s threshold`,
            p95Ms: p95LatencyMs,
          });
        } else if (p95LatencyMs > 2000) {
          anomalies.push({
            type: 'high_latency',
            severity: 'low',
            description: `p95 latency ${p95LatencyMs.toFixed(0)}ms exceeds 2s threshold`,
            p95Ms: p95LatencyMs,
          });
        }
      }

      const sampleEntries = entries.slice(0, Math.min(10, entries.length));
      for (const entry of sampleEntries) {
        if (entry.metadata && typeof entry.metadata === 'object') {
          const raw = (entry.metadata as any).raw;
          if (raw && typeof raw === 'object') {
            for (const key of PII_KEYS) {
              if (hasKey(raw, key)) {
                anomalies.push({
                  type: 'pii_in_raw',
                  severity: 'high',
                  description: `PII field '${key}' found in raw response metadata`,
                  field: key,
                });
                complianceFlags.push({
                  provider: name,
                  finding: `PII field '${key}' found in raw response metadata`,
                  severity: 'high',
                });
                break;
              }
            }
          }
        }
      }
    }

    totalAttempts += totalProviderAttempts;
    totalSuccess += successCount;

    providerSections.push({
      name,
      region: capabilities.country,
      totalAttempts: totalProviderAttempts,
      successRate,
      avgLatencyMs,
      p95LatencyMs,
      failureCount,
      rateLimitedCount,
      timeoutCount,
      estimatedFeesPaid,
      estimatedFeeCurrency: capabilities.fees.currency,
      driftEvents,
      anomalies,
    });
  }

  const overallSuccessRate = totalAttempts > 0 ? totalSuccess / totalAttempts : null;

  const anomalyCounts = { high: 0, medium: 0, low: 0 };
  for (const section of providerSections) {
    for (const anomaly of section.anomalies) {
      anomalyCounts[anomaly.severity]++;
    }
  }

  let reconciliation: AuditReport['reconciliation'] | undefined;
  let missedWebhookCount = 0;
  if (input.reconcileResults) {
    const mismatches = input.reconcileResults
      .filter((r) => r.classification === 'mismatch')
      .map((r) => ({
        provider: r.provider,
        reference: r.reference,
        expected: r.expectedStatus,
        actual: r.actualStatus ?? 'unknown',
      }));

    missedWebhookCount = mismatches.length;

    reconciliation = {
      total: input.reconcileResults.length,
      match: input.reconcileResults.filter((r) => r.classification === 'match').length,
      mismatch: input.reconcileResults.filter((r) => r.classification === 'mismatch').length,
      notFound: input.reconcileResults.filter((r) => r.classification === 'not-found').length,
      error: input.reconcileResults.filter((r) => r.classification === 'error').length,
      mismatches,
    };
  }

  return {
    generatedAt,
    windowMs,
    windowStart,
    windowEnd,
    summary: {
      totalProviders: input.providers.length,
      totalAttempts,
      overallSuccessRate,
      totalEstimatedFees: totalFees,
      totalEstimatedFeesCurrency: feeCurrencies.size === 1 ? Array.from(feeCurrencies)[0] : 'mixed',
      anomalyCounts,
      missedWebhookCount,
    },
    providers: providerSections,
    reconciliation,
    complianceFlags,
  };
}

function calculateP95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

function detectConsecutiveFailures(entries: LedgerEntry[]): number {
  let maxConsecutive = 0;
  let currentConsecutive = 0;

  for (const entry of entries) {
    if (entry.status === 'failed' || entry.status === 'timeout' || entry.status === 'rate_limited') {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 0;
    }
  }

  return maxConsecutive;
}

function hasKey(obj: any, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (key in obj) return true;
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && hasKey(obj[k], key)) {
      return true;
    }
  }
  return false;
}

export function renderAuditAsHtml(report: AuditReport): string {
  const { summary, providers, reconciliation, complianceFlags } = report;

  const severityColor = (severity: 'high' | 'medium' | 'low') => {
    return severity === 'high' ? '#ff4444' : severity === 'medium' ? '#ffaa00' : '#ffdd00';
  };

  const anomalyRows = providers.flatMap((p) =>
    p.anomalies.map((a) => ({ provider: p.name, anomaly: a }))
  ).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.anomaly.severity] - order[b.anomaly.severity];
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayBridge Audit Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 2rem;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: linear-gradient(135deg, #161b22 0%, #1c2128 100%);
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      border: 1px solid #30363d;
      position: relative;
    }
    header::before {
      content: 'AUDIT REPORT — INTERNAL USE ONLY';
      position: absolute;
      top: 1rem;
      right: 2rem;
      font-size: 0.7rem;
      color: #484f58;
      letter-spacing: 1px;
    }
    h1 { color: #58a6ff; font-size: 2rem; margin-bottom: 0.5rem; }
    .meta { color: #8b949e; font-size: 0.9rem; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.5rem;
      transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-2px); border-color: #58a6ff; }
    .card-label { color: #8b949e; font-size: 0.85rem; margin-bottom: 0.5rem; }
    .card-value { color: #58a6ff; font-size: 2rem; font-weight: bold; }
    .card-unit { color: #8b949e; font-size: 1rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #161b22;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    th {
      background: #21262d;
      color: #c9d1d9;
      text-align: left;
      padding: 1rem;
      font-weight: 600;
      border-bottom: 2px solid #30363d;
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #21262d;
    }
    tr:last-child td { border-bottom: none; }
    .section { margin-bottom: 3rem; }
    .section-title {
      color: #58a6ff;
      font-size: 1.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #30363d;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge-high { background: #ff4444; color: white; }
    .badge-medium { background: #ffaa00; color: white; }
    .badge-low { background: #ffdd00; color: #0d1117; }
    details {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: #58a6ff;
      user-select: none;
    }
    summary:hover { text-decoration: underline; }
    .no-data { color: #8b949e; font-style: italic; }
    footer {
      text-align: center;
      color: #484f58;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #21262d;
      font-size: 0.9rem;
    }
    @media print {
      body { background: white; color: black; }
      .card, table, details { background: white; border-color: #ddd; }
      th { background: #f5f5f5; }
      .badge-high { background: #ffcccc; color: #cc0000; }
      .badge-medium { background: #ffe6cc; color: #cc6600; }
      .badge-low { background: #ffffcc; color: #666600; }
      header::before { color: #ccc; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>PayBridge Audit Report</h1>
      <div class="meta">
        <div>Generated: ${new Date(report.generatedAt).toLocaleString()}</div>
        <div>Window: ${formatDuration(report.windowMs)} (${report.windowStart.split('T')[0]} to ${report.windowEnd.split('T')[0]})</div>
      </div>
    </header>

    <div class="summary">
      <div class="card">
        <div class="card-label">Total Providers</div>
        <div class="card-value">${summary.totalProviders}</div>
      </div>
      <div class="card">
        <div class="card-label">Total Attempts</div>
        <div class="card-value">${summary.totalAttempts.toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="card-label">Success Rate</div>
        <div class="card-value">${summary.overallSuccessRate !== null ? (summary.overallSuccessRate * 100).toFixed(1) : '—'}<span class="card-unit">%</span></div>
      </div>
      <div class="card">
        <div class="card-label">Estimated Fees</div>
        <div class="card-value">${summary.totalEstimatedFees.toFixed(2)} <span class="card-unit">${summary.totalEstimatedFeesCurrency}</span></div>
      </div>
      <div class="card">
        <div class="card-label">Anomalies</div>
        <div class="card-value">
          <span style="color: #ff4444">${summary.anomalyCounts.high}</span> /
          <span style="color: #ffaa00">${summary.anomalyCounts.medium}</span> /
          <span style="color: #ffdd00">${summary.anomalyCounts.low}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Missed Webhooks</div>
        <div class="card-value" style="color: ${summary.missedWebhookCount > 0 ? '#ff4444' : '#3fb950'}">
          ${summary.missedWebhookCount}
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Provider Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Region</th>
            <th>Attempts</th>
            <th>Success Rate</th>
            <th>Avg Latency</th>
            <th>p95 Latency</th>
            <th>Fees Paid</th>
            <th>Anomalies</th>
          </tr>
        </thead>
        <tbody>
          ${providers.map((p) => `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td>${p.region ?? '—'}</td>
            <td>${p.totalAttempts.toLocaleString()}</td>
            <td>${p.successRate !== null ? (p.successRate * 100).toFixed(1) + '%' : '—'}</td>
            <td>${p.avgLatencyMs !== null ? p.avgLatencyMs.toFixed(0) + 'ms' : '—'}</td>
            <td>${p.p95LatencyMs !== null ? p.p95LatencyMs.toFixed(0) + 'ms' : '—'}</td>
            <td>${p.estimatedFeesPaid.toFixed(2)} ${p.estimatedFeeCurrency}</td>
            <td>${p.anomalies.length > 0 ? p.anomalies.length : '—'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${anomalyRows.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Anomalies</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Provider</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${anomalyRows.map(({ provider, anomaly }) => `
          <tr>
            <td><span class="badge badge-${anomaly.severity}">${anomaly.severity.toUpperCase()}</span></td>
            <td>${provider}</td>
            <td>${anomaly.type}</td>
            <td>${anomaly.description}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${reconciliation ? `
    <div class="section">
      <h2 class="section-title">Reconciliation</h2>
      <div class="summary">
        <div class="card">
          <div class="card-label">Match</div>
          <div class="card-value" style="color: #3fb950">${reconciliation.match}</div>
        </div>
        <div class="card">
          <div class="card-label">Mismatch</div>
          <div class="card-value" style="color: #ff4444">${reconciliation.mismatch}</div>
        </div>
        <div class="card">
          <div class="card-label">Not Found</div>
          <div class="card-value" style="color: #ffaa00">${reconciliation.notFound}</div>
        </div>
        <div class="card">
          <div class="card-label">Error</div>
          <div class="card-value" style="color: #ff4444">${reconciliation.error}</div>
        </div>
      </div>
      ${reconciliation.mismatches.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Reference</th>
            <th>Expected</th>
            <th>Actual</th>
          </tr>
        </thead>
        <tbody>
          ${reconciliation.mismatches.map((m) => `
          <tr>
            <td>${m.provider}</td>
            <td><code>${m.reference}</code></td>
            <td>${m.expected}</td>
            <td>${m.actual}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
      ` : '<p class="no-data">No mismatches detected.</p>'}
    </div>
    ` : ''}

    ${complianceFlags.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Compliance Flags</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Provider</th>
            <th>Finding</th>
          </tr>
        </thead>
        <tbody>
          ${complianceFlags.map((f) => `
          <tr>
            <td><span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span></td>
            <td>${f.provider}</td>
            <td>${f.finding}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Per-Provider Details</h2>
      ${providers.map((p) => `
      <details>
        <summary>${p.name} — ${p.totalAttempts} attempts, ${p.successRate !== null ? (p.successRate * 100).toFixed(1) + '%' : 'N/A'} success</summary>
        <div style="margin-top: 1rem;">
          <p><strong>Failures:</strong> ${p.failureCount} (Rate Limited: ${p.rateLimitedCount}, Timeout: ${p.timeoutCount})</p>
          <p><strong>Latency:</strong> Avg ${p.avgLatencyMs !== null ? p.avgLatencyMs.toFixed(0) : 'N/A'}ms, p95 ${p.p95LatencyMs !== null ? p.p95LatencyMs.toFixed(0) : 'N/A'}ms</p>
          <p><strong>Drift Events:</strong> ${p.driftEvents.length > 0 ? p.driftEvents.map((d) => `${d.at} - ${d.summary}`).join(', ') : 'None'}</p>
          <p><strong>Anomalies:</strong> ${p.anomalies.length > 0 ? p.anomalies.map((a) => a.description).join('; ') : 'None'}</p>
        </div>
      </details>
      `).join('')}
    </div>

    <footer>
      Generated by <strong>paybridge audit</strong><br>
      Source: <a href="https://github.com/kobie3717/paybridge" style="color: #58a6ff;">github.com/kobie3717/paybridge</a>
    </footer>
  </div>
</body>
</html>`;
}

export function renderAuditAsMarkdown(report: AuditReport): string {
  const { summary, providers, reconciliation, complianceFlags } = report;

  let md = `# PayBridge Audit Report\n\n`;
  md += `**Generated:** ${new Date(report.generatedAt).toLocaleString()}\n`;
  md += `**Window:** ${formatDuration(report.windowMs)} (${report.windowStart.split('T')[0]} to ${report.windowEnd.split('T')[0]})\n\n`;

  md += `## Executive Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Providers | ${summary.totalProviders} |\n`;
  md += `| Total Attempts | ${summary.totalAttempts.toLocaleString()} |\n`;
  md += `| Success Rate | ${summary.overallSuccessRate !== null ? (summary.overallSuccessRate * 100).toFixed(1) + '%' : 'N/A'} |\n`;
  md += `| Estimated Fees | ${summary.totalEstimatedFees.toFixed(2)} ${summary.totalEstimatedFeesCurrency} |\n`;
  md += `| Anomalies (H/M/L) | ${summary.anomalyCounts.high} / ${summary.anomalyCounts.medium} / ${summary.anomalyCounts.low} |\n`;
  md += `| Missed Webhooks | ${summary.missedWebhookCount} |\n\n`;

  md += `## Provider Overview\n\n`;
  md += `| Provider | Region | Attempts | Success Rate | Avg Latency | p95 Latency | Fees Paid | Anomalies |\n`;
  md += `|----------|--------|----------|--------------|-------------|-------------|-----------|----------|\n`;
  for (const p of providers) {
    md += `| ${p.name} | ${p.region ?? 'N/A'} | ${p.totalAttempts} | ${p.successRate !== null ? (p.successRate * 100).toFixed(1) + '%' : 'N/A'} | `;
    md += `${p.avgLatencyMs !== null ? p.avgLatencyMs.toFixed(0) + 'ms' : 'N/A'} | ${p.p95LatencyMs !== null ? p.p95LatencyMs.toFixed(0) + 'ms' : 'N/A'} | `;
    md += `${p.estimatedFeesPaid.toFixed(2)} ${p.estimatedFeeCurrency} | ${p.anomalies.length || 'None'} |\n`;
  }
  md += `\n`;

  const anomalyRows = providers.flatMap((p) =>
    p.anomalies.map((a) => ({ provider: p.name, anomaly: a }))
  ).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.anomaly.severity] - order[b.anomaly.severity];
  });

  if (anomalyRows.length > 0) {
    md += `## Anomalies\n\n`;
    md += `| Severity | Provider | Type | Description |\n`;
    md += `|----------|----------|------|-------------|\n`;
    for (const { provider, anomaly } of anomalyRows) {
      md += `| ${anomaly.severity.toUpperCase()} | ${provider} | ${anomaly.type} | ${anomaly.description} |\n`;
    }
    md += `\n`;
  }

  if (reconciliation) {
    md += `## Reconciliation\n\n`;
    md += `- **Match:** ${reconciliation.match}\n`;
    md += `- **Mismatch:** ${reconciliation.mismatch}\n`;
    md += `- **Not Found:** ${reconciliation.notFound}\n`;
    md += `- **Error:** ${reconciliation.error}\n\n`;

    if (reconciliation.mismatches.length > 0) {
      md += `### Mismatches\n\n`;
      md += `| Provider | Reference | Expected | Actual |\n`;
      md += `|----------|-----------|----------|--------|\n`;
      for (const m of reconciliation.mismatches) {
        md += `| ${m.provider} | \`${m.reference}\` | ${m.expected} | ${m.actual} |\n`;
      }
      md += `\n`;
    }
  }

  if (complianceFlags.length > 0) {
    md += `## Compliance Flags\n\n`;
    md += `| Severity | Provider | Finding |\n`;
    md += `|----------|----------|----------|\n`;
    for (const f of complianceFlags) {
      md += `| ${f.severity.toUpperCase()} | ${f.provider} | ${f.finding} |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `*Generated by **paybridge audit** — [github.com/kobie3717/paybridge](https://github.com/kobie3717/paybridge)*\n`;

  return md;
}

export function renderAuditAsJson(report: AuditReport, pretty = false): string {
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

function formatDuration(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(ms / (60 * 1000))}m`;
}
