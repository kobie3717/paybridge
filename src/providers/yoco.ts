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
import { ProviderCapabilities } from '../routing-types';

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

    const amountInCents = toMinorUnit(params.amount, params.currency);

    const requestBody = {
      amount: amountInCents,
      currency: params.currency,
      cancelUrl: params.urls.cancel,
      successUrl: params.urls.success,
      failureUrl: params.urls.cancel,
      metadata: {
        reference: params.reference,
        description: params.description || '',
        customerName: params.customer.name,
        customerEmail: params.customer.email,
        ...params.metadata,
      },
    };

    const response = await fetch(`${this.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yoco API error (POST /checkouts): ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    return {
      id: data.id,
      checkoutUrl: data.redirectUrl,
      status: this.mapYocoStatus(data.status),
      amount: toMajorUnit(data.amount, params.currency),
      currency: data.currency,
      reference: data.metadata?.reference || params.reference,
      provider: 'yoco',
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  /**
   * Yoco does not support subscriptions in the standard Online Payments API.
   * Use the Yoco Recurring Billing API directly or choose another provider.
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    throw new Error(
      'Yoco does not support subscriptions. Use the Yoco Recurring Billing API directly or choose another provider.'
    );
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await fetch(`${this.baseUrl}/checkouts/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yoco API error (GET /checkouts/${id}): ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    return {
      id: data.id,
      checkoutUrl: data.redirectUrl || '',
      status: this.mapYocoStatus(data.status),
      amount: toMajorUnit(data.amount, 'ZAR'),
      currency: data.currency,
      reference: data.metadata?.reference || id,
      provider: 'yoco',
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const requestBody: any = {
      checkoutId: params.paymentId,
    };

    if (params.amount !== undefined) {
      requestBody.amount = toMinorUnit(params.amount, 'ZAR');
    }

    if (params.reason) {
      requestBody.metadata = { reason: params.reason };
    }

    const response = await fetch(`${this.baseUrl}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yoco API error (POST /refunds): ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    const status = this.mapYocoStatus(data.status);
    const refundStatus: 'pending' | 'completed' | 'failed' =
      status === 'completed' ? 'completed' :
      status === 'failed' ? 'failed' : 'pending';

    return {
      id: data.id,
      status: refundStatus,
      amount: toMajorUnit(data.amount, 'ZAR'),
      currency: data.currency,
      paymentId: params.paymentId,
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  // ==================== Webhooks ====================

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

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

  /**
   * Verify webhook signature using Yoco's Svix-based signing scheme.
   *
   * CRITICAL: body must be the raw string or Buffer from the webhook request.
   * Passing a parsed JSON object will cause signature verification to fail.
   */
  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const webhookId = headers?.['webhook-id'];
    const webhookTimestamp = headers?.['webhook-timestamp'];
    const webhookSignature = headers?.['webhook-signature'];

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return false;
    }

    const timestamp = parseInt(webhookTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (now - timestamp > 300) {
      return false;
    }

    const rawBody = typeof body === 'string' ? body : body.toString('utf8');
    const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;

    let secretBytes: Buffer;
    if (this.webhookSecret.startsWith('whsec_')) {
      secretBytes = Buffer.from(this.webhookSecret.slice(6), 'base64');
    } else {
      secretBytes = Buffer.from(this.webhookSecret, 'utf8');
    }

    const computedSig = crypto
      .createHmac('sha256', secretBytes)
      .update(signedPayload, 'utf8')
      .digest('base64');

    const signatures = webhookSignature.split(' ');
    for (const sig of signatures) {
      const [version, expectedSig] = sig.split(',');
      if (version === 'v1') {
        try {
          const computedBuffer = Buffer.from(computedSig, 'base64');
          const expectedBuffer = Buffer.from(expectedSig, 'base64');

          if (computedBuffer.length === expectedBuffer.length) {
            if (crypto.timingSafeEqual(computedBuffer, expectedBuffer)) {
              return true;
            }
          }
        } catch {
          continue;
        }
      }
    }

    return false;
  }

  // ==================== Capabilities ====================

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 0,
        percent: 2.95,
        currency: 'ZAR',
      },
      currencies: this.supportedCurrencies,
      country: 'ZA',
      avgLatencyMs: 500,
    };
  }

  // ==================== Helpers ====================

  private mapYocoStatus(yocoStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      created: 'pending',
      pending: 'pending',
      processing: 'pending',
      completed: 'completed',
      succeeded: 'completed',
      successful: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
      refunded: 'refunded',
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
      'refund.succeeded': 'refund.completed',
      'refund.failed': 'payment.failed',
    };

    return typeMap[yocoType] || 'payment.pending';
  }
}
