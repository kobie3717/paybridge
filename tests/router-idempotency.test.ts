import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { PayBridge, PayBridgeRouter, InMemoryIdempotencyStore, WebhookDuplicateError } from '../src';

describe('PayBridgeRouter Idempotency', () => {
  it('throws WebhookDuplicateError on duplicate webhook', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      idempotencyStore: new InMemoryIdempotencyStore(),
    });

    const mockBody = JSON.stringify({
      activityTypeID: 2,
      reference: 'pay_123',
      amount: '299.00',
    });

    const mockHeaders = {};

    await router.parseWebhook(mockBody, mockHeaders, 'softycomp');

    try {
      await router.parseWebhook(mockBody, mockHeaders, 'softycomp');
      assert.fail('Should have thrown WebhookDuplicateError');
    } catch (error: any) {
      assert.ok(error instanceof WebhookDuplicateError);
      assert.strictEqual(error.provider, 'softycomp');
      assert.ok(error.eventId);
    }
  });

  it('allows duplicate webhook when idempotencyStore not configured', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
    });

    const mockBody = JSON.stringify({
      activityTypeID: 2,
      reference: 'pay_456',
      amount: '299.00',
    });

    const mockHeaders = {};

    const event1 = await router.parseWebhook(mockBody, mockHeaders, 'softycomp');
    const event2 = await router.parseWebhook(mockBody, mockHeaders, 'softycomp');

    assert.strictEqual(event1.type, 'payment.completed');
    assert.strictEqual(event2.type, 'payment.completed');
  });

  it('allows same event ID from different providers', async () => {
    const softycomp = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const yoco = new PayBridge({
      provider: 'yoco',
      credentials: { apiKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider: softycomp }, { provider: yoco }],
      idempotencyStore: new InMemoryIdempotencyStore(),
    });

    const mockBodySofty = JSON.stringify({
      activityTypeID: 2,
      reference: 'pay_123',
      amount: '299.00',
    });

    const mockBodyYoco = JSON.stringify({
      type: 'payment.succeeded',
      payload: {
        id: 'pay_123',
        amountInCents: 29900,
      },
    });

    const event1 = await router.parseWebhook(mockBodySofty, {}, 'softycomp');
    const event2 = await router.parseWebhook(mockBodyYoco, {}, 'yoco');

    assert.strictEqual(event1.type, 'payment.completed');
    assert.strictEqual(event2.type, 'payment.completed');
  });

  it('deduplicates refund events', async () => {
    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test', secretKey: 'test' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      idempotencyStore: new InMemoryIdempotencyStore(),
    });

    const mockBody = JSON.stringify({
      activityTypeID: 2,
      reference: 'refund_789',
      amount: '100.00',
      refundReference: 'refund_789',
    });

    await router.parseWebhook(mockBody, {}, 'softycomp');

    try {
      await router.parseWebhook(mockBody, {}, 'softycomp');
      assert.fail('Should have thrown WebhookDuplicateError');
    } catch (error: any) {
      assert.ok(error instanceof WebhookDuplicateError);
      assert.strictEqual(error.provider, 'softycomp');
    }
  });
});
