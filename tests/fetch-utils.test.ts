/**
 * Fetch utilities tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { timedFetch, timedFetchOrThrow, FetchTimeoutError, HttpError } from '../src/utils/fetch';

describe('Fetch utilities', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('timedFetch rejects with FetchTimeoutError after timeout', async () => {
    (globalThis as any).fetch = async (_url: string, opts: any) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({ ok: true, json: async () => ({}) } as Response);
        }, 200);

        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    try {
      await timedFetch('https://example.com', { timeoutMs: 50 });
      assert.fail('Should have thrown FetchTimeoutError');
    } catch (error: any) {
      assert.strictEqual(error.name, 'FetchTimeoutError');
      assert.ok(error instanceof FetchTimeoutError);
      assert.strictEqual(error.url, 'https://example.com');
      assert.strictEqual(error.timeoutMs, 50);
    }
  });

  it('timedFetch returns response normally if under timeout', async () => {
    (globalThis as any).fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response;
    };

    const response = await timedFetch('https://example.com', { timeoutMs: 1000 });
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.status, 200);
  });

  it('timedFetch propagates caller signal abort', async () => {
    (globalThis as any).fetch = async (_url: string, opts: any) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({ ok: true } as Response);
        }, 100);

        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    try {
      await timedFetch('https://example.com', {
        timeoutMs: 500,
        signal: controller.signal,
      });
      assert.fail('Should have thrown');
    } catch (error: any) {
      assert.ok(error instanceof FetchTimeoutError);
    }
  });

  it('timedFetchOrThrow throws HttpError with status 429 and retryAfterMs from Retry-After header', async () => {
    const headers = new Map();
    headers.set('retry-after', '30');

    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()),
        },
        text: async () => 'Rate limit exceeded',
      } as any as Response;
    };

    try {
      await timedFetchOrThrow('https://example.com');
      assert.fail('Should have thrown HttpError');
    } catch (error: any) {
      assert.ok(error instanceof HttpError);
      assert.strictEqual(error.status, 429);
      assert.strictEqual(error.retryAfterMs, 30000);
      assert.ok(error.message.includes('429'));
    }
  });

  it('parseRetryAfter handles seconds form', async () => {
    const headers = new Map();
    headers.set('retry-after', '120');

    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 503,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()),
        },
        text: async () => 'Service unavailable',
      } as any as Response;
    };

    try {
      await timedFetchOrThrow('https://example.com');
      assert.fail('Should have thrown');
    } catch (error: any) {
      assert.ok(error instanceof HttpError);
      assert.strictEqual(error.retryAfterMs, 120000);
    }
  });

  it('parseRetryAfter handles HTTP-date form', async () => {
    const futureDate = new Date(Date.now() + 60000);
    const headers = new Map();
    headers.set('retry-after', futureDate.toUTCString());

    (globalThis as any).fetch = async () => {
      return {
        ok: false,
        status: 503,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()),
        },
        text: async () => 'Service unavailable',
      } as any as Response;
    };

    try {
      await timedFetchOrThrow('https://example.com');
      assert.fail('Should have thrown');
    } catch (error: any) {
      assert.ok(error instanceof HttpError);
      assert.ok(error.retryAfterMs !== undefined);
      assert.ok(error.retryAfterMs! > 55000);
      assert.ok(error.retryAfterMs! < 65000);
    }
  });

  it('timedFetchOrThrow returns response on success', async () => {
    (globalThis as any).fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      } as Response;
    };

    const response = await timedFetchOrThrow('https://example.com');
    assert.strictEqual(response.ok, true);
    const data = await response.json();
    assert.deepStrictEqual(data, { data: 'test' });
  });
});
