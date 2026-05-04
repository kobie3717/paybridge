/**
 * Square payment provider
 * Payment Links API supporting USD, CAD, GBP, AUD, EUR, JPY
 * @see https://developer.squareup.com/reference/square
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
} from '../types';
import { toMinorUnit, toMajorUnit } from '../utils/currency';
import { ProviderCapabilities } from '../routing-types';
import { timedFetchOrThrow } from '../utils/fetch';

interface SquareConfig {
  accessToken: string;
  locationId: string;
  notificationUrl?: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class SquareProvider extends PaymentProvider {
  readonly name = 'square';
  readonly supportedCurrencies = ['USD', 'CAD', 'GBP', 'AUD', 'EUR', 'JPY'];

  private accessToken: string;
  private locationId: string;
  private notificationUrl?: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl: string;

  constructor(config: SquareConfig) {
    super();

    this.accessToken = config.accessToken;
    this.locationId = config.locationId;
    this.notificationUrl = config.notificationUrl;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? false;

    this.baseUrl = this.sandbox
      ? 'https://connect.squareupsandbox.com/v2'
      : 'https://connect.squareup.com/v2';
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await timedFetchOrThrow(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-09-19',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    return (await response.json()) as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);

    const requestBody = {
      idempotency_key: crypto.randomUUID(),
      quick_pay: {
        name: params.description || params.reference,
        price_money: {
          amount: amountInMinorUnits,
          currency: params.currency,
        },
        location_id: this.locationId,
      },
      checkout_options: {
        redirect_url: params.urls.success,
        ask_for_shipping_address: false,
      },
      pre_populated_data: {
        buyer_email: params.customer.email,
      },
    };

    const response = await this.apiRequest<any>('POST', '/online-checkout/payment-links', requestBody);

    const link = response.payment_link;

    return {
      id: link.id,
      checkoutUrl: link.url,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      reference: params.reference,
      provider: 'square',
      createdAt: link.created_at || new Date().toISOString(),
      raw: response,
    };
  }

  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error(
      'Square subscriptions require multi-step Catalog + Customer + Plan setup; not yet supported by paybridge. Use the Square Subscriptions API directly or choose another provider.'
    );
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const linkResponse = await this.apiRequest<any>('GET', `/online-checkout/payment-links/${id}`);
    const link = linkResponse.payment_link;

    const orderId = link.order_id;
    const orderResponse = await this.apiRequest<any>('GET', `/orders/${orderId}`);
    const order = orderResponse.order;

    let status: PaymentStatus = 'pending';
    if (order.state === 'COMPLETED') {
      status = 'completed';
    } else if (order.state === 'CANCELED') {
      status = 'cancelled';
    } else if (order.state === 'OPEN') {
      status = 'pending';
    }

    const currency = order.total_money?.currency || 'USD';
    const amount = order.total_money?.amount ? toMajorUnit(order.total_money.amount, currency) : 0;

    return {
      id: link.id,
      checkoutUrl: link.url || '',
      status,
      amount,
      currency: currency.toUpperCase(),
      reference: link.id,
      provider: 'square',
      createdAt: link.created_at || new Date().toISOString(),
      raw: { link, order },
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const currency = 'USD';
    const amountInMinorUnits = params.amount ? toMinorUnit(params.amount, currency) : undefined;

    const refundData: Record<string, any> = {
      idempotency_key: crypto.randomUUID(),
      payment_id: params.paymentId,
      reason: params.reason || 'Refund',
    };

    if (amountInMinorUnits !== undefined) {
      refundData.amount_money = {
        amount: amountInMinorUnits,
        currency,
      };
    }

    const response = await this.apiRequest<any>('POST', '/refunds', refundData);
    const refund = response.refund;

    const refundCurrency = refund.amount_money?.currency || currency;
    const refundAmount = refund.amount_money?.amount
      ? toMajorUnit(refund.amount_money.amount, refundCurrency)
      : 0;

    return {
      id: refund.id,
      status: refund.status === 'COMPLETED' ? 'completed' : 'pending',
      amount: refundAmount,
      currency: refundCurrency.toUpperCase(),
      paymentId: params.paymentId,
      createdAt: refund.created_at || new Date().toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const typeMap: Record<string, WebhookEvent['type']> = {
      'payment.created': 'payment.completed',
      'payment.updated': 'payment.pending',
      'refund.created': 'refund.completed',
      'refund.updated': 'refund.completed',
    };

    let eventType = typeMap[event.type] || 'payment.pending';

    const data = event.data?.object?.payment || event.data?.object?.refund || {};

    if (event.type === 'payment.updated' && data.status === 'COMPLETED') {
      eventType = 'payment.completed';
    } else if (event.type === 'payment.updated' && data.status === 'FAILED') {
      eventType = 'payment.failed';
    } else if (event.type === 'payment.updated' && data.status === 'CANCELED') {
      eventType = 'payment.cancelled';
    }

    let payment: PaymentResult | undefined;
    let refund: RefundResult | undefined;

    if (event.type.startsWith('payment.')) {
      const currency = data.amount_money?.currency || 'USD';
      let status: PaymentStatus = 'pending';
      if (data.status === 'COMPLETED') {
        status = 'completed';
      } else if (data.status === 'FAILED') {
        status = 'failed';
      } else if (data.status === 'CANCELED') {
        status = 'cancelled';
      }

      payment = {
        id: data.id,
        checkoutUrl: '',
        status,
        amount: data.amount_money?.amount ? toMajorUnit(data.amount_money.amount, currency) : 0,
        currency: currency.toUpperCase(),
        reference: data.id,
        provider: 'square',
        createdAt: data.created_at || new Date().toISOString(),
      };
    } else if (event.type.startsWith('refund.')) {
      const currency = data.amount_money?.currency || 'USD';
      refund = {
        id: data.id,
        status: data.status === 'COMPLETED' ? 'completed' : 'pending',
        amount: data.amount_money?.amount ? toMajorUnit(data.amount_money.amount, currency) : 0,
        currency: currency.toUpperCase(),
        paymentId: data.payment_id || '',
        createdAt: data.created_at || new Date().toISOString(),
      };
    }

    return {
      type: eventType,
      payment,
      refund,
      raw: event,
    };
  }

  /**
   * Verify webhook signature using Square's HMAC-SHA256 scheme.
   *
   * Square signs the concatenation of: notificationUrl + rawBody
   * TODO(verify): Confirm Square's current signing scheme matches this implementation.
   */
  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret || !this.notificationUrl) {
      return false;
    }

    const signature = headers?.['x-square-hmacsha256-signature'];
    if (!signature) {
      return false;
    }

    const rawBody = typeof body === 'string' ? body : body.toString('utf8');
    const signedString = `${this.notificationUrl}${rawBody}`;

    const computedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedString)
      .digest('base64');

    try {
      const computedBuffer = Buffer.from(computedSig, 'base64');
      const expectedBuffer = Buffer.from(signature, 'base64');

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
        fixed: 0.10,
        percent: 2.6,
        currency: 'USD',
      },
      currencies: this.supportedCurrencies,
      country: 'US',
      avgLatencyMs: 400,
    };
  }
}
