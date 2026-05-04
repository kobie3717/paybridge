/**
 * Mercado Pago payment provider
 * Leading payment platform for Latin America
 * @see https://www.mercadopago.com/developers/en/reference
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

interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class MercadoPagoProvider extends PaymentProvider {
  readonly name = 'mercadopago';
  readonly supportedCurrencies = ['BRL', 'ARS', 'USD', 'MXN', 'COP', 'CLP', 'ZAR'];

  private accessToken: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl = 'https://api.mercadopago.com';

  constructor(config: MercadoPagoConfig) {
    super();

    this.accessToken = config.accessToken;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? this.accessToken.startsWith('TEST-');
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await timedFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const json = await response.json();

    if (!response.ok) {
      const message = (json as any).message || (json as any).error || `Mercado Pago API error (${method} ${path}): ${response.status}`;
      throw new Error(message);
    }

    return json as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const [firstName, ...lastNameParts] = params.customer.name.split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    const metadata: Record<string, any> = {
      reference: params.reference,
      ...(params.metadata || {}),
    };

    const requestBody = {
      items: [
        {
          title: params.description || params.reference,
          quantity: 1,
          unit_price: params.amount,
          currency_id: params.currency,
        },
      ],
      payer: {
        email: params.customer.email,
        name: firstName,
        surname: lastName,
      },
      external_reference: params.reference,
      back_urls: {
        success: params.urls.success,
        failure: params.urls.cancel,
        pending: params.urls.success,
      },
      notification_url: params.urls.webhook,
      auto_return: 'approved',
      metadata,
    };

    const response = await this.apiRequest<any>('POST', '/checkout/preferences', requestBody);

    const checkoutUrl = this.sandbox ? response.sandbox_init_point : response.init_point;

    return {
      id: response.id,
      checkoutUrl,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      reference: params.reference,
      provider: 'mercadopago',
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    let frequency: number;
    let frequencyType: 'days' | 'months';

    switch (params.interval) {
      case 'weekly':
        frequency = 7;
        frequencyType = 'days';
        break;
      case 'monthly':
        frequency = 1;
        frequencyType = 'months';
        break;
      case 'yearly':
        frequency = 12;
        frequencyType = 'months';
        break;
    }

    const requestBody = {
      reason: params.description || params.reference,
      auto_recurring: {
        frequency,
        frequency_type: frequencyType,
        transaction_amount: params.amount,
        currency_id: params.currency,
      },
      payer_email: params.customer.email,
      back_url: params.urls.success,
      external_reference: params.reference,
    };

    const response = await this.apiRequest<any>('POST', '/preapproval', requestBody);

    return {
      id: response.id,
      checkoutUrl: response.init_point,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      interval: params.interval,
      reference: params.reference,
      provider: 'mercadopago',
      startsAt: params.startDate,
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await this.apiRequest<any>('GET', `/v1/payments/search?external_reference=${encodeURIComponent(id)}`);

    if (!response.results || response.results.length === 0) {
      return {
        id,
        checkoutUrl: '',
        status: 'pending',
        amount: 0,
        currency: 'BRL',
        reference: id,
        provider: 'mercadopago',
        createdAt: new Date().toISOString(),
        raw: response,
      };
    }

    const payment = response.results[0];
    const currency = (payment.currency_id || 'BRL').toUpperCase();

    let status: PaymentStatus = 'pending';
    if (payment.status === 'approved') {
      status = 'completed';
    } else if (payment.status === 'rejected') {
      status = 'failed';
    } else if (payment.status === 'cancelled') {
      status = 'cancelled';
    }

    return {
      id: payment.id?.toString() || id,
      checkoutUrl: '',
      status,
      amount: payment.transaction_amount || 0,
      currency,
      reference: payment.external_reference || id,
      provider: 'mercadopago',
      createdAt: new Date(payment.date_created || Date.now()).toISOString(),
      raw: response,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundData: Record<string, any> = {};

    if (params.amount !== undefined) {
      refundData.amount = params.amount;
    }

    const response = await this.apiRequest<any>('POST', `/v1/payments/${params.paymentId}/refunds`, refundData);

    const currency = (response.payment?.currency_id || 'BRL').toUpperCase();

    return {
      id: response.id?.toString() || response.refund_id?.toString(),
      status: response.status === 'approved' ? 'completed' : 'pending',
      amount: response.amount || 0,
      currency,
      paymentId: params.paymentId,
      createdAt: new Date(response.date_created || Date.now()).toISOString(),
      raw: response,
    };
  }

  /**
   * Parse Mercado Pago webhook notification.
   * Note: MP webhooks are notification events that require a follow-up API call to get full payment details.
   * This method returns a pending event; caller should use getPayment(data.id) to fetch real status.
   */
  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType: WebhookEvent['type'] = 'payment.pending';

    return {
      type: eventType,
      payment: {
        id: event.data?.id?.toString() || '',
        checkoutUrl: '',
        status: 'pending',
        amount: 0,
        currency: 'BRL',
        reference: '',
        provider: 'mercadopago',
        createdAt: new Date().toISOString(),
      },
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const signature = headers?.['x-signature'] || headers?.['X-Signature'];
    if (!signature) {
      return false;
    }

    const parts = signature.split(',').reduce((acc: Record<string, string>, part: string) => {
      const [key, value] = part.split('=');
      if (key && value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {});

    const ts = parts.ts;
    const v1 = parts.v1;

    if (!ts || !v1) {
      return false;
    }

    const timestampNum = parseInt(ts, 10);
    const now = Math.floor(Date.now() / 1000);

    if (now - timestampNum > 300) {
      return false;
    }

    const requestId = headers?.['x-request-id'] || headers?.['X-Request-Id'];
    const eventData = typeof body === 'string' ? JSON.parse(body) : body;
    const dataId = eventData.data?.id || '';

    const template = `id:${dataId};request-id:${requestId};ts:${ts};`;

    const computedSig = crypto.createHmac('sha256', this.webhookSecret).update(template, 'utf8').digest('hex');

    try {
      const computedBuffer = Buffer.from(computedSig, 'hex');
      const expectedBuffer = Buffer.from(v1, 'hex');

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
        percent: 4.99,
        currency: 'BRL',
      },
      currencies: this.supportedCurrencies,
      country: 'BR',
      avgLatencyMs: 700,
    };
  }
}
