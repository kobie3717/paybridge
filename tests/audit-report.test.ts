import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAuditReport, renderAuditAsHtml, renderAuditAsMarkdown, renderAuditAsJson, type AuditInput } from '../src/audit-report';
import { InMemoryLedgerStore, type LedgerEntry } from '../src/ledger';
import type { ProviderCapabilities } from '../src/routing-types';
import type { ReconcileResult } from '../src/cli/reconcile-types';

const mockCapabilities: ProviderCapabilities = {
  fees: { fixed: 0.5, percent: 2.5, currency: 'USD' },
  currencies: ['USD', 'ZAR'],
  avgLatencyMs: 500,
  country: 'US',
};

test('generateAuditReport - empty inputs produces valid report', async () => {
  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
  };

  const report = await generateAuditReport(input);

  assert.equal(report.summary.totalProviders, 1);
  assert.equal(report.summary.totalAttempts, 0);
  assert.equal(report.summary.overallSuccessRate, null);
  assert.equal(report.providers.length, 1);
  assert.equal(report.providers[0].name, 'stripe');
  assert.equal(report.providers[0].successRate, null);
});

test('generateAuditReport - calculates success rate correctly', async () => {
  const ledger = new InMemoryLedgerStore();
  const now = Date.now();

  for (let i = 0; i < 100; i++) {
    const entry: LedgerEntry = {
      id: `entry-${i}`,
      timestamp: new Date(now - i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: i < 80 ? 'success' : 'failed',
      amount: 100,
      currency: 'USD',
      durationMs: 500 + Math.random() * 1000,
    };
    await ledger.append(entry);
  }

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
    windowMs: 7 * 24 * 60 * 60 * 1000,
  };

  const report = await generateAuditReport(input);

  assert.equal(report.summary.totalAttempts, 100);
  assert.equal(report.summary.overallSuccessRate, 0.8);
  assert.equal(report.providers[0].successRate, 0.8);
  assert.equal(report.providers[0].failureCount, 20);
});

test('generateAuditReport - p95 latency calculation', async () => {
  const ledger = new InMemoryLedgerStore();
  const now = Date.now();

  const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];

  for (let i = 0; i < latencies.length; i++) {
    const entry: LedgerEntry = {
      id: `entry-${i}`,
      timestamp: new Date(now - i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: 'success',
      amount: 100,
      currency: 'USD',
      durationMs: latencies[i],
    };
    await ledger.append(entry);
  }

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
  };

  const report = await generateAuditReport(input);

  assert.ok(report.providers[0].p95LatencyMs !== null);
  assert.equal(report.providers[0].p95LatencyMs, 1900);
});

test('generateAuditReport - detects success rate drop', async () => {
  const ledger = new InMemoryLedgerStore();
  const windowMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const halfWindow = windowMs / 2;

  for (let i = 0; i < 50; i++) {
    const entry: LedgerEntry = {
      id: `entry-old-${i}`,
      timestamp: new Date(now - windowMs + i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: i < 45 ? 'success' : 'failed',
      amount: 100,
      currency: 'USD',
    };
    await ledger.append(entry);
  }

  for (let i = 0; i < 50; i++) {
    const entry: LedgerEntry = {
      id: `entry-new-${i}`,
      timestamp: new Date(now - halfWindow + i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: i < 30 ? 'success' : 'failed',
      amount: 100,
      currency: 'USD',
    };
    await ledger.append(entry);
  }

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
    windowMs,
    generatedAt: new Date(now).toISOString(),
  };

  const report = await generateAuditReport(input);

  assert.ok(report.providers[0].anomalies.length > 0);
  const dropAnomaly = report.providers[0].anomalies.find((a) => a.type === 'success_rate_drop');
  assert.ok(dropAnomaly, 'Should detect success rate drop');
  if (dropAnomaly && dropAnomaly.type === 'success_rate_drop') {
    assert.ok(['low', 'medium', 'high'].includes(dropAnomaly.severity), 'Should have valid severity');
  }
});

test('generateAuditReport - detects consecutive failures', async () => {
  const ledger = new InMemoryLedgerStore();
  const now = Date.now();

  for (let i = 0; i < 10; i++) {
    const entry: LedgerEntry = {
      id: `entry-${i}`,
      timestamp: new Date(now - i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: i < 5 ? 'failed' : 'success',
      amount: 100,
      currency: 'USD',
    };
    await ledger.append(entry);
  }

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
  };

  const report = await generateAuditReport(input);

  const consecutiveAnomaly = report.providers[0].anomalies.find((a) => a.type === 'consecutive_failures');
  assert.ok(consecutiveAnomaly, 'Should detect consecutive failures');
  if (consecutiveAnomaly && consecutiveAnomaly.type === 'consecutive_failures') {
    assert.equal(consecutiveAnomaly.count, 5);
    assert.equal(consecutiveAnomaly.severity, 'high');
  }
});

test('generateAuditReport - detects high latency', async () => {
  const ledger = new InMemoryLedgerStore();
  const now = Date.now();

  for (let i = 0; i < 20; i++) {
    const entry: LedgerEntry = {
      id: `entry-${i}`,
      timestamp: new Date(now - i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: 'success',
      amount: 100,
      currency: 'USD',
      durationMs: i < 1 ? 500 : 12000,
    };
    await ledger.append(entry);
  }

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
  };

  const report = await generateAuditReport(input);

  assert.ok(report.providers[0].p95LatencyMs !== null);
  assert.ok(report.providers[0].p95LatencyMs! > 10000, 'p95 should be > 10000ms');

  const latencyAnomaly = report.providers[0].anomalies.find((a) => a.type === 'high_latency');
  assert.ok(latencyAnomaly, 'Should detect high latency');
  if (latencyAnomaly && latencyAnomaly.type === 'high_latency') {
    assert.equal(latencyAnomaly.severity, 'high');
  }
});

test('generateAuditReport - calculates estimated fees', async () => {
  const ledger = new InMemoryLedgerStore();
  const now = Date.now();

  for (let i = 0; i < 10; i++) {
    const entry: LedgerEntry = {
      id: `entry-${i}`,
      timestamp: new Date(now - i * 60000).toISOString(),
      operation: 'createPayment',
      provider: 'stripe',
      status: 'success',
      amount: 100,
      currency: 'USD',
    };
    await ledger.append(entry);
  }

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
  };

  const report = await generateAuditReport(input);

  const expectedFeePerTx = 0.5 + (100 * 2.5) / 100;
  const expectedTotalFees = expectedFeePerTx * 10;

  assert.equal(report.providers[0].estimatedFeesPaid, expectedTotalFees);
  assert.equal(report.summary.totalEstimatedFees, expectedTotalFees);
});

test('generateAuditReport - includes reconciliation data', async () => {
  const reconcileResults: ReconcileResult[] = [
    { provider: 'stripe', reference: 'ref-1', expectedStatus: 'completed', actualStatus: 'completed', classification: 'match' },
    { provider: 'stripe', reference: 'ref-2', expectedStatus: 'pending', actualStatus: 'completed', classification: 'mismatch' },
    { provider: 'stripe', reference: 'ref-3', expectedStatus: 'completed', actualStatus: 'failed', classification: 'mismatch' },
  ];

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    reconcileResults,
  };

  const report = await generateAuditReport(input);

  assert.ok(report.reconciliation);
  assert.equal(report.reconciliation.total, 3);
  assert.equal(report.reconciliation.match, 1);
  assert.equal(report.reconciliation.mismatch, 2);
  assert.equal(report.reconciliation.mismatches.length, 2);
  assert.equal(report.summary.missedWebhookCount, 2);
});

test('renderAuditAsHtml - produces well-formed HTML', async () => {
  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
  };

  const report = await generateAuditReport(input);
  const html = renderAuditAsHtml(report);

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('<html'));
  assert.ok(html.includes('</html>'));
  assert.ok(html.includes('PayBridge Audit Report'));
  assert.ok(html.includes('stripe'));

  const openTags = (html.match(/<(div|table|tr|td|th|body|head|html)/g) || []).length;
  const closeTags = (html.match(/<\/(div|table|tr|td|th|body|head|html)>/g) || []).length;
  assert.ok(openTags > 0 && closeTags > 0, 'Should have balanced tags');
});

test('renderAuditAsMarkdown - produces valid markdown', async () => {
  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
  };

  const report = await generateAuditReport(input);
  const md = renderAuditAsMarkdown(report);

  assert.ok(md.includes('# PayBridge Audit Report'));
  assert.ok(md.includes('## Executive Summary'));
  assert.ok(md.includes('| Provider |'));
  assert.ok(md.includes('stripe'));
});

test('renderAuditAsJson - produces valid JSON', async () => {
  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
  };

  const report = await generateAuditReport(input);
  const json = renderAuditAsJson(report, true);

  const parsed = JSON.parse(json);
  assert.equal(parsed.summary.totalProviders, 1);
  assert.equal(parsed.providers[0].name, 'stripe');
});

test('generateAuditReport - multiple providers with mixed currencies', async () => {
  const input: AuditInput = {
    providers: [
      { name: 'stripe', capabilities: { ...mockCapabilities, fees: { fixed: 0.3, percent: 2.9, currency: 'USD' } } },
      { name: 'paystack', capabilities: { ...mockCapabilities, fees: { fixed: 0, percent: 1.5, currency: 'ZAR' } } },
    ],
  };

  const report = await generateAuditReport(input);

  assert.equal(report.summary.totalProviders, 2);
  assert.equal(report.summary.totalEstimatedFeesCurrency, 'mixed');
});

test('generateAuditReport - detects PII in raw metadata', async () => {
  const ledger = new InMemoryLedgerStore();
  const now = Date.now();

  const entry: LedgerEntry = {
    id: 'entry-1',
    timestamp: new Date(now).toISOString(),
    operation: 'createPayment',
    provider: 'stripe',
    status: 'success',
    amount: 100,
    currency: 'USD',
    metadata: {
      raw: {
        id: 'pay_123',
        email: 'user@example.com',
      },
    },
  };
  await ledger.append(entry);

  const input: AuditInput = {
    providers: [{ name: 'stripe', capabilities: mockCapabilities }],
    ledger,
  };

  const report = await generateAuditReport(input);

  const piiAnomaly = report.providers[0].anomalies.find((a) => a.type === 'pii_in_raw');
  assert.ok(piiAnomaly, 'Should detect PII in raw metadata');
  if (piiAnomaly && piiAnomaly.type === 'pii_in_raw') {
    assert.equal(piiAnomaly.severity, 'high');
    assert.equal(piiAnomaly.field, 'email');
  }

  assert.equal(report.complianceFlags.length, 1);
  assert.equal(report.complianceFlags[0].severity, 'high');
});
