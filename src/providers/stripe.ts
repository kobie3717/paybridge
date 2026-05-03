/**
 * Stripe payment provider
 * Global payment processor supporting 135+ currencies
 * @see https://stripe.com/docs/api
 */

import * as crypto from 'crypto';
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
  SubscriptionInterval,
} from '../types';
import { toMinorUnit, toMajorUnit } from '../utils/currency';
import { ProviderCapabilities } from '../routing-types';
import { timedFetchOrThrow } from '../utils/fetch';

interface StripeConfig {
  apiKey: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class StripeProvider extends PaymentProvider {
  readonly name = 'stripe';
  readonly supportedCurrencies = ['USD', 'EUR', 'GBP', 'ZAR', 'NGN'];

  private apiKey: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl = 'https://api.stripe.com/v1';

  constructor(config: StripeConfig) {
    super();

    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? this.apiKey.startsWith('sk_test_');
  }

  private buildFormData(data: Record<string, any>, prefix = ''): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;

      const fieldName = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === 'object' && !Array.isArray(value)) {
        parts.push(this.buildFormData(value, fieldName));
      } else {
        parts.push(`${encodeURIComponent(fieldName)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.join('&');
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const body = data ? this.buildFormData(data) : undefined;

    const response = await timedFetchOrThrow(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    return (await response.json()) as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);
    const currencyLower = params.currency.toLowerCase();

    const metadata: Record<string, string> = {
      reference: params.reference,
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        metadata[key] = String(value);
      }
    }

    const sessionData = {
      mode: 'payment',
      'line_items[0][price_data][currency]': currencyLower,
      'line_items[0][price_data][unit_amount]': amountInMinorUnits,
      'line_items[0][price_data][product_data][name]': params.description || params.reference,
      'line_items[0][quantity]': 1,
      success_url: params.urls.success,
      cancel_url: params.urls.cancel,
      client_reference_id: params.reference,
      customer_email: params.customer.email,
    };

    for (const [key, value] of Object.entries(metadata)) {
      (sessionData as any)[`metadata[${key}]`] = value;
    }

    const response = await this.apiRequest<any>('POST', '/checkout/sessions', sessionData);

    return {
      id: response.id,
      checkoutUrl: response.url,
      status: 'pending',
      amount: toMajorUnit(response.amount_total || amountInMinorUnits, params.currency),
      currency: (response.currency || currencyLower).toUpperCase(),
      reference: response.client_reference_id || params.reference,
      provider: 'stripe',
      createdAt: new Date(response.created * 1000).toISOString(),
      expiresAt: response.expires_at ? new Date(response.expires_at * 1000).toISOString() : undefined,
      raw: response,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);
    const currencyLower = params.currency.toLowerCase();

    const intervalMap: Record<SubscriptionInterval, string> = {
      weekly: 'week',
      monthly: 'month',
      yearly: 'year',
    };

    const stripeInterval = intervalMap[params.interval];

    const metadata: Record<string, string> = {
      reference: params.reference,
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        metadata[key] = String(value);
      }
    }

    const sessionData = {
      mode: 'subscription',
      'line_items[0][price_data][currency]': currencyLower,
      'line_items[0][price_data][unit_amount]': amountInMinorUnits,
      'line_items[0][price_data][recurring][interval]': stripeInterval,
      'line_items[0][price_data][product_data][name]': params.description || params.reference,
      'line_items[0][quantity]': 1,
      success_url: params.urls.success,
      cancel_url: params.urls.cancel,
      client_reference_id: params.reference,
      customer_email: params.customer.email,
    };

    for (const [key, value] of Object.entries(metadata)) {
      (sessionData as any)[`metadata[${key}]`] = value;
    }

    const response = await this.apiRequest<any>('POST', '/checkout/sessions', sessionData);

    return {
      id: response.id,
      checkoutUrl: response.url,
      status: 'pending',
      amount: toMajorUnit(response.amount_total || amountInMinorUnits, params.currency),
      currency: (response.currency || currencyLower).toUpperCase(),
      interval: params.interval,
      reference: response.client_reference_id || params.reference,
      provider: 'stripe',
      startsAt: params.startDate,
      createdAt: new Date(response.created * 1000).toISOString(),
      raw: response,
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const session = await this.apiRequest<any>('GET', `/checkout/sessions/${id}`);

    let status: PaymentStatus = 'pending';
    if (session.payment_status === 'paid') {
      status = 'completed';
    } else if (session.payment_status === 'unpaid' && session.status === 'open') {
      status = 'pending';
    } else if (session.status === 'expired') {
      status = 'failed';
    }

    const currency = (session.currency || 'USD').toUpperCase();

    return {
      id: session.id,
      checkoutUrl: session.url || '',
      status,
      amount: toMajorUnit(session.amount_total || 0, currency),
      currency,
      reference: session.client_reference_id || session.id,
      provider: 'stripe',
      createdAt: new Date(session.created * 1000).toISOString(),
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
      raw: session,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    let paymentIntentId: string;

    if (params.paymentId.startsWith('cs_')) {
      const session = await this.apiRequest<any>('GET', `/checkout/sessions/${params.paymentId}`);
      paymentIntentId = session.payment_intent;

      if (!paymentIntentId) {
        throw new Error('Session has no payment_intent - payment may not be completed yet');
      }
    } else {
      paymentIntentId = params.paymentId;
    }

    const refundData: Record<string, any> = {
      payment_intent: paymentIntentId,
    };

    if (params.amount !== undefined) {
      refundData.amount = toMinorUnit(params.amount, 'USD');
    }

    if (params.reason) {
      refundData.reason = 'requested_by_customer';
      refundData['metadata[reason]'] = params.reason;
    }

    const response = await this.apiRequest<any>('POST', '/refunds', refundData);

    const currency = (response.currency || 'USD').toUpperCase();

    return {
      id: response.id,
      status: response.status === 'succeeded' ? 'completed' : 'pending',
      amount: toMajorUnit(response.amount || 0, currency),
      currency,
      paymentId: params.paymentId,
      createdAt: new Date(response.created * 1000).toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const typeMap: Record<string, WebhookEvent['type']> = {
      'checkout.session.completed': 'payment.completed',
      'checkout.session.expired': 'payment.cancelled',
      'checkout.session.async_payment_failed': 'payment.failed',
      'payment_intent.succeeded': 'payment.completed',
      'payment_intent.payment_failed': 'payment.failed',
      'charge.refunded': 'refund.completed',
      'customer.subscription.created': 'subscription.created',
      'customer.subscription.deleted': 'subscription.cancelled',
    };

    const eventType = typeMap[event.type] || 'payment.pending';
    const data = event.data?.object || {};

    let payment: PaymentResult | undefined;
    let subscription: SubscriptionResult | undefined;
    let refund: RefundResult | undefined;

    if (event.type.startsWith('checkout.session') || event.type.startsWith('payment_intent')) {
      const currency = (data.currency || 'USD').toUpperCase();
      let status: PaymentStatus = 'pending';

      if (data.payment_status === 'paid' || data.status === 'succeeded') {
        status = 'completed';
      } else if (data.status === 'expired') {
        status = 'failed';
      } else if (event.type.includes('failed')) {
        status = 'failed';
      }

      payment = {
        id: data.id,
        checkoutUrl: data.url || '',
        status,
        amount: toMajorUnit(data.amount_total || data.amount || 0, currency),
        currency,
        reference: data.client_reference_id || data.id,
        provider: 'stripe',
        createdAt: new Date((data.created || Date.now() / 1000) * 1000).toISOString(),
      };
    } else if (event.type.startsWith('customer.subscription')) {
      const currency = (data.currency || 'USD').toUpperCase();
      subscription = {
        id: data.id,
        checkoutUrl: '',
        status: event.type.includes('deleted') ? 'cancelled' : 'active',
        amount: toMajorUnit(data.plan?.amount || 0, currency),
        currency,
        interval: 'monthly',
        reference: data.metadata?.reference || data.id,
        provider: 'stripe',
        createdAt: new Date((data.created || Date.now() / 1000) * 1000).toISOString(),
      };
    } else if (event.type === 'charge.refunded') {
      const currency = (data.currency || 'USD').toUpperCase();
      refund = {
        id: data.refunds?.data?.[0]?.id || data.id,
        status: 'completed',
        amount: toMajorUnit(data.amount_refunded || 0, currency),
        currency,
        paymentId: data.payment_intent || data.id,
        createdAt: new Date((data.created || Date.now() / 1000) * 1000).toISOString(),
      };
    }

    return {
      type: eventType,
      payment,
      subscription,
      refund,
      raw: event,
    };
  }

  /**
   * Verify webhook signature using Stripe's scheme.
   *
   * CRITICAL: body must be the raw string or Buffer from the webhook request.
   * Passing a parsed JSON object will cause signature verification to fail.
   */
  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const signature = headers?.['stripe-signature'] || headers?.['Stripe-Signature'];
    if (!signature) {
      return false;
    }

    const parts = signature.split(',').reduce((acc: Record<string, string>, part: string) => {
      const [key, value] = part.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const timestamp = parts.t;
    const expectedSig = parts.v1;

    if (!timestamp || !expectedSig) {
      return false;
    }

    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (now - timestampNum > 300) {
      return false;
    }

    const rawBody = typeof body === 'string' ? body : body.toString('utf8');
    const signedPayload = `${timestamp}.${rawBody}`;

    const computedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    try {
      const computedBuffer = Buffer.from(computedSig, 'hex');
      const expectedBuffer = Buffer.from(expectedSig, 'hex');

      if (computedBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 0.30,
        percent: 2.9,
        currency: 'USD',
      },
      currencies: this.supportedCurrencies,
      country: 'GLOBAL',
      avgLatencyMs: 400,
    };
  }
}
