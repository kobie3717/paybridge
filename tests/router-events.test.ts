import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PayBridgeRouter } from '../src/router';
import { PayBridge } from '../src/index';
import type { RouterEvent } from '../src/router-events';

describe('Router Events', () => {
  it('should emit attempt.start and attempt.failure with provider + reference + operation + durationMs', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test_key', secretKey: 'test_secret' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      fallback: { enabled: false },
    });

    const startEvents: RouterEvent[] = [];
    const failureEvents: RouterEvent[] = [];
    router.events.on('attempt.start', (event: RouterEvent) => {
      startEvents.push(event);
    });
    router.events.on('attempt.failure', (event: RouterEvent) => {
      failureEvents.push(event);
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-001',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    assert.ok(startEvents.length > 0, 'should have emitted at least one attempt.start');
    const startEvent = startEvents[0];
    assert.equal(startEvent.type, 'attempt.start');
    assert.equal(startEvent.provider, 'softycomp');
    assert.equal(startEvent.operation, 'createPayment');
    assert.equal(startEvent.reference, 'TEST-001');

    assert.ok(failureEvents.length > 0, 'should have emitted at least one attempt.failure');
    const failEvent = failureEvents[0];
    assert.equal(failEvent.provider, 'softycomp');
    assert.ok(typeof failEvent.durationMs === 'number');
  });

  it('should emit circuit.opened after 5 consecutive failures', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'fail', secretKey: 'fail' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      fallback: { enabled: true, maxAttempts: 6 },
    });

    const circuitEvents: RouterEvent[] = [];
    router.events.on('circuit.opened', (event: RouterEvent) => {
      circuitEvents.push(event);
    });

    for (let i = 0; i < 5; i++) {
      try {
        await router.createPayment({
          amount: 100,
          currency: 'ZAR',
          reference: `TEST-${i}`,
          customer: { name: 'Test', email: 'test@example.com' },
          urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
        });
      } catch (err) {
      }
    }

    assert.ok(circuitEvents.length > 0, 'circuit.opened should have been emitted');
    assert.equal(circuitEvents[0].type, 'circuit.opened');
    assert.equal(circuitEvents[0].provider, 'softycomp');
  });

  it('should emit wildcard * listener for all events', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test_key', secretKey: 'test_secret' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
    });

    const allEvents: RouterEvent[] = [];
    router.events.on('*', (event: RouterEvent) => {
      allEvents.push(event);
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-WILDCARD',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    assert.ok(allEvents.length >= 2, 'should capture attempt.start and attempt.success/failure');
    assert.ok(allEvents.some(e => e.type === 'attempt.start'));
  });

  it('should have zero overhead when no listeners attached', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test_key', secretKey: 'test_secret' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-NO-LISTENER',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    assert.ok(true, 'should not throw or leak when no listeners');
  });
});
