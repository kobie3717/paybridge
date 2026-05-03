/**
 * PayStack payment provider
 * Leading payment gateway for Africa (Nigeria, Ghana, South Africa, Kenya)
 * @see https://paystack.com/docs/api
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

interface PayStackConfig {
  apiKey: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class PayStackProvider extends PaymentProvider {
  readonly name = 'paystack';
  readonly supportedCurrencies = ['NGN', 'GHS', 'ZAR', 'USD', 'KES'];

  private apiKey: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl = 'https://api.paystack.co';

  constructor(config: PayStackConfig) {
    super();

    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? this.apiKey.startsWith('sk_test_');
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await timedFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const json = await response.json();

    if (!response.ok || (json as any).status === false) {
      throw new Error((json as any).message || `PayStack API error (${method} ${path}): ${response.status}`);
    }

    return json as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);

    const metadata: Record<string, any> = {
      cancel_action: params.urls.cancel,
      reference: params.reference,
      custom_fields: [
        {
          display_name: 'Customer',
          variable_name: 'customer_name',
          value: params.customer.name,
        },
      ],
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        metadata[key] = value;
      }
    }

    const requestBody = {
      email: params.customer.email,
      amount: amountInMinorUnits,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.urls.success,
      metadata,
    };

    const response = await this.apiRequest<any>('POST', '/transaction/initialize', requestBody);

    return {
      id: response.data.reference,
      checkoutUrl: response.data.authorization_url,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      reference: response.data.reference,
      provider: 'paystack',
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);

    const intervalMap: Record<SubscriptionInterval, string> = {
      weekly: 'weekly',
      monthly: 'monthly',
      yearly: 'annually',
    };

    const paystackInterval = intervalMap[params.interval];

    const planData = {
      name: params.description || params.reference,
      amount: amountInMinorUnits,
      interval: paystackInterval,
      currency: params.currency,
    };

    const planResponse = await this.apiRequest<any>('POST', '/plan', planData);
    const planCode = planResponse.data.plan_code;

    const metadata: Record<string, any> = {
      cancel_action: params.urls.cancel,
      reference: params.reference,
      custom_fields: [
        {
          display_name: 'Customer',
          variable_name: 'customer_name',
          value: params.customer.name,
        },
      ],
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        metadata[key] = value;
      }
    }

    const transactionData = {
      email: params.customer.email,
      plan: planCode,
      callback_url: params.urls.success,
      metadata,
    };

    const transactionResponse = await this.apiRequest<any>('POST', '/transaction/initialize', transactionData);

    return {
      id: transactionResponse.data.reference,
      checkoutUrl: transactionResponse.data.authorization_url,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      interval: params.interval,
      reference: params.reference,
      provider: 'paystack',
      startsAt: params.startDate,
      createdAt: new Date().toISOString(),
      raw: transactionResponse,
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await this.apiRequest<any>('GET', `/transaction/verify/${id}`);

    const data = response.data;
    const currency = (data.currency || 'NGN').toUpperCase();

    let status: PaymentStatus = 'pending';
    if (data.status === 'success') {
      status = 'completed';
    } else if (data.status === 'failed') {
      status = 'failed';
    } else if (data.status === 'abandoned') {
      status = 'cancelled';
    }

    return {
      id: data.reference,
      checkoutUrl: '',
      status,
      amount: toMajorUnit(data.amount, currency),
      currency,
      reference: data.reference,
      provider: 'paystack',
      createdAt: new Date(data.created_at || data.createdAt || Date.now()).toISOString(),
      raw: response,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundData: Record<string, any> = {
      transaction: params.paymentId,
    };

    if (params.amount !== undefined) {
      const currency = 'NGN';
      refundData.amount = toMinorUnit(params.amount, currency);
    }

    if (params.reason) {
      refundData.merchant_note = params.reason;
    }

    const response = await this.apiRequest<any>('POST', '/refund', refundData);

    const data = response.data;
    const currency = (data.currency || 'NGN').toUpperCase();

    let status: 'pending' | 'completed' | 'failed' = 'pending';
    if (data.status === 'processed') {
      status = 'completed';
    } else if (data.status === 'failed') {
      status = 'failed';
    }

    return {
      id: data.id?.toString() || data.reference,
      status,
      amount: toMajorUnit(data.amount || 0, currency),
      currency,
      paymentId: params.paymentId,
      createdAt: new Date(data.created_at || data.createdAt || Date.now()).toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const typeMap: Record<string, WebhookEvent['type']> = {
      'charge.success': 'payment.completed',
      'charge.failed': 'payment.failed',
      'subscription.create': 'subscription.created',
      'subscription.disable': 'subscription.cancelled',
      'subscription.expiring_cards': 'payment.pending',
      'refund.processed': 'refund.completed',
      'refund.failed': 'payment.failed',
    };

    const eventType = typeMap[event.event] || 'payment.pending';
    const data = event.data || {};

    let payment: PaymentResult | undefined;
    let subscription: SubscriptionResult | undefined;
    let refund: RefundResult | undefined;

    if (event.event.startsWith('charge.')) {
      const currency = (data.currency || 'NGN').toUpperCase();
      let status: PaymentStatus = 'pending';

      if (event.event === 'charge.success') {
        status = 'completed';
      } else if (event.event === 'charge.failed') {
        status = 'failed';
      }

      payment = {
        id: data.reference,
        checkoutUrl: '',
        status,
        amount: toMajorUnit(data.amount || 0, currency),
        currency,
        reference: data.reference,
        provider: 'paystack',
        createdAt: new Date(data.created_at || data.paid_at || Date.now()).toISOString(),
      };
    } else if (event.event.startsWith('subscription.')) {
      const currency = (data.currency || 'NGN').toUpperCase();
      subscription = {
        id: data.subscription_code || data.id?.toString() || '',
        checkoutUrl: '',
        status: event.event === 'subscription.disable' ? 'cancelled' : 'active',
        amount: toMajorUnit(data.amount || 0, currency),
        currency,
        interval: 'monthly',
        reference: data.subscription_code || '',
        provider: 'paystack',
        createdAt: new Date(data.created_at || Date.now()).toISOString(),
      };
    } else if (event.event.startsWith('refund.')) {
      const currency = (data.currency || 'NGN').toUpperCase();
      refund = {
        id: data.id?.toString() || data.refund_id?.toString() || '',
        status: event.event === 'refund.processed' ? 'completed' : 'failed',
        amount: toMajorUnit(data.amount || 0, currency),
        currency,
        paymentId: data.transaction_reference || data.transaction || '',
        createdAt: new Date(data.created_at || Date.now()).toISOString(),
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
   * Verify webhook signature using PayStack's HMAC-SHA512 scheme.
   *
   * CRITICAL: body must be the raw string or Buffer from the webhook request.
   * Passing a parsed JSON object will cause signature verification to fail.
   */
  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.apiKey) {
      return false;
    }

    const signature = headers?.['x-paystack-signature'] || headers?.['X-Paystack-Signature'];
    if (!signature) {
      return false;
    }

    const rawBody = typeof body === 'string' ? body : body.toString('utf8');

    const computedSig = crypto
      .createHmac('sha512', this.apiKey)
      .update(rawBody)
      .digest('hex');

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
        fixed: 100,
        percent: 1.5,
        currency: 'NGN',
      },
      currencies: this.supportedCurrencies,
      country: 'NG',
      avgLatencyMs: 600,
    };
  }
}
