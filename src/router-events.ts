import { EventEmitter } from 'node:events';

export type RouterEventType =
  | 'attempt.start'
  | 'attempt.success'
  | 'attempt.failure'
  | 'attempt.rate_limited'
  | 'attempt.timeout'
  | 'circuit.opened'
  | 'circuit.half_opened'
  | 'circuit.closed'
  | 'webhook.duplicate'
  | 'request.success'
  | 'request.failure';

export interface RouterEvent {
  type: RouterEventType;
  provider?: string;
  operation?: 'createPayment' | 'createSubscription' | 'getPayment' | 'refund' | 'parseWebhook' | 'createOnRamp' | 'createOffRamp' | 'getQuote' | 'getRamp';
  reference?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  attempt?: number;
  timestamp: string;
}

export class RouterEventEmitter extends EventEmitter {
  emitEvent(event: RouterEvent): void {
    this.emit(event.type, event);
    this.emit('*', event);
  }
}
