/**
 * Razorpay payment provider
 * Leading payment gateway for India
 * @see https://razorpay.com/docs/api
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
import { timedFetch } from '../utils/fetch';

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class RazorpayProvider extends PaymentProvider {
  readonly name = 'razorpay';
  readonly supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD'];

  private keyId: string;
  private keySecret: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl = 'https://api.razorpay.com/v1';

  constructor(config: RazorpayConfig) {
    super();

    this.keyId = config.keyId;
    this.keySecret = config.keySecret;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? this.keyId.startsWith('rzp_test_');
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const authString = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await timedFetch(url, {
      method,
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const json = await response.json();

    if (!response.ok) {
      const message = (json as any).error?.description || `Razorpay API error (${method} ${path}): ${response.status}`;
      throw new Error(message);
    }

    return json as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);

    const orderData = {
      amount: amountInMinorUnits,
      currency: params.currency,
      receipt: params.reference,
      notes: {
        reference: params.reference,
        customerEmail: params.customer.email,
        ...(params.metadata || {}),
      },
    };

    const order = await this.apiRequest<any>('POST', '/orders', orderData);

    const checkoutUrl = `https://api.razorpay.com/v1/checkout/embedded?key_id=${this.keyId}&order_id=${order.id}`;

    return {
      id: order.id,
      checkoutUrl,
      status: 'pending',
      amount: toMajorUnit(order.amount, params.currency),
      currency: order.currency,
      reference: params.reference,
      provider: 'razorpay',
      createdAt: new Date(order.created_at * 1000).toISOString(),
      raw: order,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);

    const intervalMap: Record<SubscriptionInterval, string> = {
      weekly: 'weekly',
      monthly: 'monthly',
      yearly: 'yearly',
    };

    const planData = {
      period: intervalMap[params.interval],
      interval: 1,
      item: {
        name: params.description || params.reference,
        amount: amountInMinorUnits,
        currency: params.currency,
      },
    };

    const plan = await this.apiRequest<any>('POST', '/plans', planData);

    const subscriptionData = {
      plan_id: plan.id,
      total_count: 12,
      customer_notify: 1,
      notes: {
        reference: params.reference,
        ...(params.metadata || {}),
      },
    };

    const subscription = await this.apiRequest<any>('POST', '/subscriptions', subscriptionData);

    const checkoutUrl = `https://api.razorpay.com/v1/checkout/embedded?key_id=${this.keyId}&subscription_id=${subscription.id}`;

    return {
      id: subscription.id,
      checkoutUrl,
      status: 'pending',
      amount: toMajorUnit(subscription.plan_id ? amountInMinorUnits : 0, params.currency),
      currency: params.currency,
      interval: params.interval,
      reference: params.reference,
      provider: 'razorpay',
      startsAt: params.startDate,
      createdAt: new Date(subscription.created_at * 1000).toISOString(),
      raw: subscription,
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const paymentsResponse = await this.apiRequest<any>('GET', `/orders/${id}/payments`);

    if (!paymentsResponse.items || paymentsResponse.items.length === 0) {
      const order = await this.apiRequest<any>('GET', `/orders/${id}`);
      const currency = order.currency || 'INR';

      return {
        id: order.id,
        checkoutUrl: '',
        status: 'pending',
        amount: toMajorUnit(order.amount || 0, currency),
        currency,
        reference: order.receipt || id,
        provider: 'razorpay',
        createdAt: new Date(order.created_at * 1000).toISOString(),
        raw: order,
      };
    }

    const payment = paymentsResponse.items[0];
    const currency = payment.currency || 'INR';

    let status: PaymentStatus = 'pending';
    if (payment.status === 'captured') {
      status = 'completed';
    } else if (payment.status === 'authorized') {
      status = 'pending';
    } else if (payment.status === 'failed') {
      status = 'failed';
    } else if (payment.status === 'refunded') {
      status = 'refunded';
    }

    return {
      id: payment.id,
      checkoutUrl: '',
      status,
      amount: toMajorUnit(payment.amount || 0, currency),
      currency,
      reference: payment.notes?.reference || payment.order_id || id,
      provider: 'razorpay',
      createdAt: new Date(payment.created_at * 1000).toISOString(),
      raw: paymentsResponse,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    let paymentId = params.paymentId;

    if (paymentId.startsWith('order_')) {
      const paymentsResponse = await this.apiRequest<any>('GET', `/orders/${paymentId}/payments`);
      if (paymentsResponse.items && paymentsResponse.items.length > 0) {
        paymentId = paymentsResponse.items[0].id;
      } else {
        throw new Error('Order has no payments to refund');
      }
    }

    const refundData: Record<string, any> = {
      speed: 'normal',
    };

    if (params.amount !== undefined) {
      refundData.amount = toMinorUnit(params.amount, 'INR');
    }

    if (params.reason) {
      refundData.notes = { reason: params.reason };
    }

    const response = await this.apiRequest<any>('POST', `/payments/${paymentId}/refund`, refundData);

    const currency = response.currency || 'INR';

    return {
      id: response.id,
      status: response.status === 'processed' ? 'completed' : 'pending',
      amount: toMajorUnit(response.amount || 0, currency),
      currency,
      paymentId: params.paymentId,
      createdAt: new Date(response.created_at * 1000).toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const typeMap: Record<string, WebhookEvent['type']> = {
      'payment.captured': 'payment.completed',
      'payment.failed': 'payment.failed',
      'subscription.activated': 'subscription.created',
      'subscription.cancelled': 'subscription.cancelled',
      'refund.created': 'refund.completed',
      'refund.processed': 'refund.completed',
    };

    const eventType = typeMap[event.event] || 'payment.pending';
    const data = event.payload?.payment?.entity || event.payload?.subscription?.entity || event.payload?.refund?.entity || {};

    let payment: PaymentResult | undefined;
    let subscription: SubscriptionResult | undefined;
    let refund: RefundResult | undefined;

    if (event.event.startsWith('payment.')) {
      const currency = (data.currency || 'INR').toUpperCase();
      let status: PaymentStatus = 'pending';

      if (event.event === 'payment.captured') {
        status = 'completed';
      } else if (event.event === 'payment.failed') {
        status = 'failed';
      }

      payment = {
        id: data.id || '',
        checkoutUrl: '',
        status,
        amount: toMajorUnit(data.amount || 0, currency),
        currency,
        reference: data.order_id || data.id || '',
        provider: 'razorpay',
        createdAt: new Date((data.created_at || Date.now() / 1000) * 1000).toISOString(),
      };
    } else if (event.event.startsWith('subscription.')) {
      const currency = 'INR';
      subscription = {
        id: data.id || '',
        checkoutUrl: '',
        status: event.event === 'subscription.cancelled' ? 'cancelled' : 'active',
        amount: toMajorUnit(data.plan_id?.amount || 0, currency),
        currency,
        interval: 'monthly',
        reference: data.notes?.reference || data.id || '',
        provider: 'razorpay',
        createdAt: new Date((data.created_at || Date.now() / 1000) * 1000).toISOString(),
      };
    } else if (event.event.startsWith('refund.')) {
      const currency = (data.currency || 'INR').toUpperCase();
      refund = {
        id: data.id || '',
        status: event.event === 'refund.processed' ? 'completed' : 'pending',
        amount: toMajorUnit(data.amount || 0, currency),
        currency,
        paymentId: data.payment_id || '',
        createdAt: new Date((data.created_at || Date.now() / 1000) * 1000).toISOString(),
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
   * Verify Razorpay webhook signature using HMAC-SHA256.
   * Note: Razorpay does not include timestamp in webhook signature (no replay protection).
   */
  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const signature = headers?.['x-razorpay-signature'] || headers?.['X-Razorpay-Signature'];
    if (!signature) {
      return false;
    }

    const rawBody = typeof body === 'string' ? body : body.toString('utf8');

    const computedSig = crypto.createHmac('sha256', this.webhookSecret).update(rawBody, 'utf8').digest('hex');

    try {
      const computedBuffer = Buffer.from(computedSig, 'hex');
      const expectedBuffer = Buffer.from(signature, 'hex');

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
        fixed: 0,
        percent: 2.0,
        currency: 'INR',
      },
      currencies: this.supportedCurrencies,
      country: 'IN',
      avgLatencyMs: 500,
    };
  }
}
