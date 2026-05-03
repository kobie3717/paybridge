/**
 * Fetch utilities with timeout and HTTP error handling
 */

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

export class FetchTimeoutError extends Error {
  readonly name = 'FetchTimeoutError';
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export class HttpError extends Error {
  readonly name = 'HttpError';
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly body?: string;

  constructor(status: number, message: string, opts: { retryAfterMs?: number; body?: string } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = opts.retryAfterMs;
    this.body = opts.body;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function timedFetch(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = opts;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function timedFetchOrThrow(url: string, opts: FetchOptions = {}): Promise<Response> {
  const response = await timedFetch(url, opts);
  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch {}
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : undefined;
    throw new HttpError(
      response.status,
      `HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`,
      { retryAfterMs, body }
    );
  }
  return response;
}

function parseRetryAfter(value: string): number | undefined {
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (!isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}
