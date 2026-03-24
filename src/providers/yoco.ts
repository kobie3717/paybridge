/**
 * Yoco payment provider
 * South African online payment gateway
 * @see https://developer.yoco.com
 */

import crypto from 'crypto';
import { PaymentProvider } from './base';
import {
  CreatePaymentParams,
  PaymentResult,
  CreateSubscriptionParams,
  SubscriptionResult,
  RefundParams,
  RefundResult,
  WebhookEvent,
  PaymentStatus,
} from '../types';
import { toMinorUnit, toMajorUnit } from '../utils/currency';

interface YocoConfig {
  apiKey: string; // Secret key
  sandbox: boolean;
  webhookSecret?: string;
}

export class YocoProvider extends PaymentProvider {
  readonly name = 'yoco';
  readonly supportedCurrencies = ['ZAR'];

  private apiKey: string;
  private sandbox: boolean;
  private baseUrl: string;
  private webhookSecret?: string;

  constructor(config: YocoConfig) {
    super();

    this.apiKey = config.apiKey;
    this.sandbox = config.sandbox;
    this.webhookSecret = config.webhookSecret;

    // Yoco uses same API for sandbox and production, differentiated by API keys
    this.baseUrl = 'https://payments.yoco.com/api/v1';
  }

  // ==================== Payment Methods ====================

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    // TODO: Implement Yoco checkout creation
    // POST /v1/checkouts
    // Amount must be in CENTS (minor unit)
    // Auth: Bearer {secret_key}
    // Body: {
    //   amount: 29900, // cents
    //   currency: "ZAR",
    //   cancelUrl: "...",
    //   successUrl: "...",
    //   failureUrl: "...",
    //   metadata: { ... }
    // }

    const amountInCents = toMinorUnit(params.amount, params.currency);

    const requestBody = {
      amount: amountInCents,
      currency: params.currency,
      cancelUrl: params.urls.cancel,
      successUrl: params.urls.success,
      failureUrl: params.urls.cancel,
      metadata: {
        reference: params.reference,
        description: params.description,
        customerName: params.customer.name,
        customerEmail: params.customer.email,
        ...params.metadata,
      },
    };

    // TODO: Make actual API request
    console.warn('[PayBridge:Yoco] createPayment not yet implemented:', requestBody);

    throw new Error('Yoco provider not yet fully implemented. Coming soon!');
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    // TODO: Implement Yoco subscription creation
    // Yoco may not support subscriptions directly - need to check their API
    // May need to implement via recurring charges or use Yoco recurring billing

    console.warn('[PayBridge:Yoco] createSubscription not yet implemented');

    throw new Error('Yoco subscriptions not yet implemented. Coming soon!');
  }

  async getPayment(id: string): Promise<PaymentResult> {
    // TODO: Implement Yoco payment status check
    // GET /v1/checkouts/{id}
    // Auth: Bearer {secret_key}

    console.warn('[PayBridge:Yoco] getPayment not yet implemented:', id);

    throw new Error('Yoco getPayment not yet implemented. Coming soon!');
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    // TODO: Implement Yoco refund
    // POST /v1/refunds
    // Amount in CENTS
    // Auth: Bearer {secret_key}
    // Body: {
    //   paymentId: "...",
    //   amount: 29900 // cents, optional for partial refund
    // }

    const amountInCents = params.amount ? toMinorUnit(params.amount, 'ZAR') : undefined;

    console.warn('[PayBridge:Yoco] refund not yet implemented:', { ...params, amountInCents });

    throw new Error('Yoco refunds not yet implemented. Coming soon!');
  }

  // ==================== Webhooks ====================

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    // TODO: Map Yoco webhook structure to PayBridge WebhookEvent
    // Yoco webhook payload structure:
    // {
    //   type: "payment.succeeded" | "payment.failed" | "payment.refunded",
    //   payload: {
    //     id: "...",
    //     amount: 29900, // cents
    //     currency: "ZAR",
    //     status: "succeeded" | "failed" | "refunded",
    //     metadata: { ... }
    //   }
    // }

    const yocoStatus = event.payload?.status || event.status;
    const status: PaymentStatus = this.mapYocoStatus(yocoStatus);
    const eventType = this.mapYocoEventType(event.type);

    return {
      type: eventType,
      payment: {
        id: event.payload?.id || event.id,
        checkoutUrl: '',
        status,
        amount: toMajorUnit(event.payload?.amount || 0, 'ZAR'),
        currency: 'ZAR',
        reference: event.payload?.metadata?.reference || '',
        provider: 'yoco',
        createdAt: event.payload?.createdDate || new Date().toISOString(),
      },
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    const signature = headers?.['x-yoco-signature'] || headers?.signature;

    if (!signature || !this.webhookSecret) {
      // No signature validation configured
      return true;
    }

    // TODO: Implement Yoco signature validation
    // Yoco uses HMAC-SHA256 with X-Yoco-Signature header
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    return signature === expectedSignature;
  }

  // ==================== Helpers ====================

  private mapYocoStatus(yocoStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      succeeded: 'completed',
      successful: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
      refunded: 'refunded',
      pending: 'pending',
    };

    return statusMap[yocoStatus?.toLowerCase()] || 'pending';
  }

  private mapYocoEventType(yocoType: string): WebhookEvent['type'] {
    const typeMap: Record<string, WebhookEvent['type']> = {
      'payment.succeeded': 'payment.completed',
      'payment.successful': 'payment.completed',
      'payment.failed': 'payment.failed',
      'payment.cancelled': 'payment.cancelled',
      'payment.refunded': 'refund.completed',
    };

    return typeMap[yocoType] || 'payment.pending';
  }
}
