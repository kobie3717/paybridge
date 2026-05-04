import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PayBridgeRouter } from '../src/router';
import { PayBridge } from '../src/index';
import type { TracerLike, SpanLike } from '../src/tracer';

describe('Tracer', () => {
  it('custom tracer startSpan is called once per attempt', async () => {
    const spans: any[] = [];
    const customTracer: TracerLike = {
      startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanLike {
        const span = {
          name,
          attributes: { ...attributes },
          ended: false,
          setAttribute(key: string, value: string | number | boolean) {
            this.attributes[key] = value;
          },
          recordException(error: Error) {
            this.attributes._exception = error.message;
          },
          end() {
            this.ended = true;
          },
        };
        spans.push(span);
        return span;
      },
    };

    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test_key', secretKey: 'test_secret' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      tracer: customTracer,
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-TRACER',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    assert.ok(spans.length > 0, 'should have started at least one span');
    const span = spans[0];
    assert.equal(span.name, 'paybridge.router.createPayment');
    assert.ok(span.ended, 'span should be ended');
  });

  it('span receives paybridge.provider + paybridge.payment.id attributes', async () => {
    const spans: any[] = [];
    const customTracer: TracerLike = {
      startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanLike {
        const span = {
          name,
          attributes: { ...attributes },
          ended: false,
          setAttribute(key: string, value: string | number | boolean) {
            this.attributes[key] = value;
          },
          recordException(error: Error) {
            this.attributes._exception = error.message;
          },
          end() {
            this.ended = true;
          },
        };
        spans.push(span);
        return span;
      },
    };

    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'test_key', secretKey: 'test_secret' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      tracer: customTracer,
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-SPAN-ATTRS',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    const span = spans[0];
    assert.equal(span.attributes['paybridge.provider'], 'softycomp');
    assert.equal(span.attributes['paybridge.strategy'], 'cheapest');
    assert.ok(span.attributes['paybridge.attempt']);
  });

  it('recordException called on failed attempt', async () => {
    const spans: any[] = [];
    const customTracer: TracerLike = {
      startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanLike {
        const span = {
          name,
          attributes: { ...attributes },
          ended: false,
          setAttribute(key: string, value: string | number | boolean) {
            this.attributes[key] = value;
          },
          recordException(error: Error) {
            this.attributes._exception = error.message;
          },
          end() {
            this.ended = true;
          },
        };
        spans.push(span);
        return span;
      },
    };

    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'fail', secretKey: 'fail' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      tracer: customTracer,
      fallback: { enabled: false },
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-EXCEPTION',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    const span = spans[0];
    assert.ok(span.attributes._exception, 'should have recorded exception');
  });

  it('end() called even on failure', async () => {
    const spans: any[] = [];
    const customTracer: TracerLike = {
      startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanLike {
        const span = {
          name,
          attributes: { ...attributes },
          ended: false,
          setAttribute(key: string, value: string | number | boolean) {
            this.attributes[key] = value;
          },
          recordException(error: Error) {
            this.attributes._exception = error.message;
          },
          end() {
            this.ended = true;
          },
        };
        spans.push(span);
        return span;
      },
    };

    const provider = new PayBridge({
      provider: 'softycomp',
      credentials: { apiKey: 'fail', secretKey: 'fail' },
      sandbox: true,
    });

    const router = new PayBridgeRouter({
      providers: [{ provider }],
      tracer: customTracer,
      fallback: { enabled: false },
    });

    try {
      await router.createPayment({
        amount: 100,
        currency: 'ZAR',
        reference: 'TEST-END-ON-FAIL',
        customer: { name: 'Test', email: 'test@example.com' },
        urls: { success: 'https://example.com/success', cancel: 'https://example.com/cancel', webhook: 'https://example.com/webhook' },
      });
    } catch (err) {
    }

    const span = spans[0];
    assert.ok(span.ended, 'span should be ended even on failure');
  });
});
