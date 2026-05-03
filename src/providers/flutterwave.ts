/**
 * Flutterwave payment provider
 * Leading payment gateway for Africa with global reach
 * @see https://developer.flutterwave.com/docs
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
import { ProviderCapabilities } from '../routing-types';
import { timedFetch } from '../utils/fetch';

interface FlutterwaveConfig {
  apiKey: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class FlutterwaveProvider extends PaymentProvider {
  readonly name = 'flutterwave';
  readonly supportedCurrencies = ['NGN', 'GHS', 'KES', 'UGX', 'ZAR', 'USD', 'EUR', 'GBP'];

  private apiKey: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl = 'https://api.flutterwave.com/v3';

  constructor(config: FlutterwaveConfig) {
    super();

    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? this.apiKey.startsWith('FLWSECK_TEST-');
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

    if (!response.ok || (json as any).status !== 'success') {
      throw new Error((json as any).message || `Flutterwave API error (${method} ${path}): ${response.status}`);
    }

    return json as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const metadata: Record<string, any> = {
      reference: params.reference,
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        metadata[key] = value;
      }
    }

    const requestBody = {
      tx_ref: params.reference,
      amount: params.amount.toFixed(2),
      currency: params.currency,
      redirect_url: params.urls.success,
      customer: {
        email: params.customer.email,
        phonenumber: params.customer.phone,
        name: params.customer.name,
      },
      customizations: {
        title: params.description || 'Payment',
        description: params.description,
      },
      meta: metadata,
    };

    const response = await this.apiRequest<any>('POST', '/payments', requestBody);

    return {
      id: params.reference,
      checkoutUrl: response.data.link,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      reference: params.reference,
      provider: 'flutterwave',
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    const intervalMap: Record<SubscriptionInterval, string> = {
      weekly: 'weekly',
      monthly: 'monthly',
      yearly: 'yearly',
    };

    const flutterwaveInterval = intervalMap[params.interval];

    const planData = {
      amount: Math.round(params.amount),
      name: params.description || params.reference,
      interval: flutterwaveInterval,
      currency: params.currency,
      duration: 0,
    };

    const planResponse = await this.apiRequest<any>('POST', '/payment-plans', planData);
    const planId = planResponse.data.id;

    const metadata: Record<string, any> = {
      reference: params.reference,
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        metadata[key] = value;
      }
    }

    const paymentData = {
      tx_ref: params.reference,
      amount: params.amount.toFixed(2),
      currency: params.currency,
      redirect_url: params.urls.success,
      payment_plan: planId,
      customer: {
        email: params.customer.email,
        phonenumber: params.customer.phone,
        name: params.customer.name,
      },
      customizations: {
        title: params.description || params.reference,
        description: params.description,
      },
      meta: metadata,
    };

    const paymentResponse = await this.apiRequest<any>('POST', '/payments', paymentData);

    return {
      id: params.reference,
      checkoutUrl: paymentResponse.data.link,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      interval: params.interval,
      reference: params.reference,
      provider: 'flutterwave',
      startsAt: params.startDate,
      createdAt: new Date().toISOString(),
      raw: paymentResponse,
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await this.apiRequest<any>('GET', `/transactions/verify_by_reference?tx_ref=${id}`);

    const data = response.data;
    const currency = (data.currency || 'NGN').toUpperCase();

    let status: PaymentStatus = 'pending';
    if (data.status === 'successful') {
      status = 'completed';
    } else if (data.status === 'failed') {
      status = 'failed';
    }

    return {
      id: data.tx_ref || id,
      checkoutUrl: '',
      status,
      amount: data.amount,
      currency,
      reference: data.tx_ref || id,
      provider: 'flutterwave',
      createdAt: new Date(data.created_at || Date.now()).toISOString(),
      raw: response,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    let flwId: number;

    if (/^\d+$/.test(params.paymentId)) {
      flwId = parseInt(params.paymentId, 10);
    } else {
      const verifyResponse = await this.apiRequest<any>(
        'GET',
        `/transactions/verify_by_reference?tx_ref=${params.paymentId}`
      );
      flwId = verifyResponse.data.id;

      if (!flwId) {
        throw new Error('Transaction not found or has no Flutterwave ID');
      }
    }

    const refundData: Record<string, any> = {};

    if (params.amount !== undefined) {
      refundData.amount = params.amount.toFixed(2);
    }

    const response = await this.apiRequest<any>('POST', `/transactions/${flwId}/refund`, refundData);

    const data = response.data;
    const currency = (data.currency || 'NGN').toUpperCase();

    let status: 'pending' | 'completed' | 'failed' = 'pending';
    if (data.status === 'completed') {
      status = 'completed';
    } else if (data.status === 'failed') {
      status = 'failed';
    }

    return {
      id: data.id?.toString() || flwId.toString(),
      status,
      amount: data.amount || params.amount || 0,
      currency,
      paymentId: params.paymentId,
      createdAt: new Date(data.created_at || Date.now()).toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const typeMap: Record<string, WebhookEvent['type']> = {
      'charge.completed': 'payment.completed',
      'transfer.completed': 'payment.completed',
      'subscription.cancelled': 'subscription.cancelled',
      'refund.completed': 'refund.completed',
    };

    let eventType: WebhookEvent['type'] = 'payment.pending';

    if (event.event === 'charge.completed' && event.data?.status === 'successful') {
      eventType = 'payment.completed';
    } else if (event.event === 'charge.completed' && event.data?.status === 'failed') {
      eventType = 'payment.failed';
    } else {
      eventType = typeMap[event.event] || 'payment.pending';
    }

    const data = event.data || {};

    let payment: PaymentResult | undefined;
    let subscription: SubscriptionResult | undefined;
    let refund: RefundResult | undefined;

    if (event.event === 'charge.completed' || event.event === 'transfer.completed') {
      const currency = (data.currency || 'NGN').toUpperCase();
      let status: PaymentStatus = 'pending';

      if (data.status === 'successful') {
        status = 'completed';
      } else if (data.status === 'failed') {
        status = 'failed';
      }

      payment = {
        id: data.id?.toString() || '',
        checkoutUrl: '',
        status,
        amount: data.amount || 0,
        currency,
        reference: data.tx_ref || '',
        provider: 'flutterwave',
        createdAt: new Date(data.created_at || Date.now()).toISOString(),
      };
    } else if (event.event === 'subscription.cancelled') {
      const currency = (data.currency || 'NGN').toUpperCase();
      subscription = {
        id: data.id?.toString() || '',
        checkoutUrl: '',
        status: 'cancelled',
        amount: data.amount || 0,
        currency,
        interval: 'monthly',
        reference: data.tx_ref || '',
        provider: 'flutterwave',
        createdAt: new Date(data.created_at || Date.now()).toISOString(),
      };
    } else if (event.event === 'refund.completed') {
      const currency = (data.currency || 'NGN').toUpperCase();
      refund = {
        id: data.id?.toString() || '',
        status: 'completed',
        amount: data.amount || 0,
        currency,
        paymentId: data.tx_ref || '',
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
   * Verify webhook signature using Flutterwave's scheme.
   * Flutterwave sends the configured webhook secret hash as the verif-hash header.
   * This is a simple equality check, not HMAC.
   */
  verifyWebhook(body: any, headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const receivedHash = headers?.['verif-hash'] || headers?.['Verif-Hash'];
    if (!receivedHash) {
      return false;
    }

    try {
      const secretBuffer = Buffer.from(this.webhookSecret, 'utf8');
      const receivedBuffer = Buffer.from(receivedHash, 'utf8');

      if (secretBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(secretBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 0,
        percent: 1.4,
        currency: 'NGN',
      },
      currencies: this.supportedCurrencies,
      country: 'NG',
      avgLatencyMs: 700,
    };
  }
}
