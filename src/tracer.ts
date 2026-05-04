export interface SpanLike {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException?(error: Error): void;
  end(): void;
}

export interface TracerLike {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanLike;
}

export const noopTracer: TracerLike = {
  startSpan: () => ({
    setAttribute: () => {},
    recordException: () => {},
    end: () => {},
  }),
};
