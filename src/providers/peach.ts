/**
 * Peach Payments provider
 * South African payment gateway using Open Payment Platform (OPP)
 * @see https://docs.peachpayments.com
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
import { ProviderCapabilities } from '../routing-types';
import { timedFetchOrThrow } from '../utils/fetch';

interface PeachConfig {
  accessToken: string;
  entityId: string;
  sandbox: boolean;
  webhookSecret?: string;
}

export class PeachProvider extends PaymentProvider {
  readonly name = 'peach';
  readonly supportedCurrencies = ['ZAR', 'USD', 'EUR', 'GBP'];

  private accessToken: string;
  private entityId: string;
  private sandbox: boolean;
  private webhookSecret?: string;
  private baseUrl: string;

  constructor(config: PeachConfig) {
    super();

    this.accessToken = config.accessToken;
    this.entityId = config.entityId;
    this.sandbox = config.sandbox;
    this.webhookSecret = config.webhookSecret;

    this.baseUrl = this.sandbox
      ? 'https://eu-test.oppwa.com'
      : 'https://eu-prod.oppwa.com';
  }

  private buildFormData(data: Record<string, any>): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }

    return parts.join('&');
  }

  private async apiRequest<T = any>(
    method: string,
    path: string,
    data?: Record<string, any>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let finalUrl = url;
    let body: string | undefined;

    if (method === 'GET' && data) {
      const queryData = { entityId: this.entityId, ...data };
      const queryString = this.buildFormData(queryData);
      finalUrl = `${url}?${queryString}`;
    } else if (data) {
      const bodyData = { entityId: this.entityId, ...data };
      body = this.buildFormData(bodyData);
    }

    const response = await timedFetchOrThrow(finalUrl, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    return (await response.json()) as T;
  }

  private mapPeachStatus(code: string): PaymentStatus {
    if (code.startsWith('000.000.') || code.startsWith('000.100.')) {
      return 'completed';
    }
    if (code.startsWith('000.200.')) {
      return 'pending';
    }
    if (code.startsWith('000.400.')) {
      return 'cancelled';
    }
    if (
      code.startsWith('100.') ||
      code.startsWith('200.') ||
      code.startsWith('300.') ||
      code.startsWith('400.') ||
      code.startsWith('500.') ||
      code.startsWith('600.') ||
      code.startsWith('700.') ||
      code.startsWith('800.') ||
      code.startsWith('900.')
    ) {
      return 'failed';
    }
    return 'pending';
  }

  /**
   * Create a one-time payment checkout.
   *
   * IMPORTANT: The returned checkoutUrl is a JavaScript widget URL, not a direct redirect.
   * You must embed it in an HTML page with:
   *
   * <script src="{checkoutUrl}"></script>
   * <form action="{successUrl}" class="paymentWidgets" data-brands="VISA MASTER"></form>
   *
   * The widget will render the payment form inside the <form> element.
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const nameParts = params.customer.name.split(' ');
    const givenName = nameParts[0] || '';
    const surname = nameParts.slice(1).join(' ') || givenName;

    const formData: Record<string, any> = {
      amount: params.amount.toFixed(2),
      currency: params.currency,
      paymentType: 'DB',
      merchantTransactionId: params.reference,
      'customer.email': params.customer.email,
      'customer.givenName': givenName,
      'customer.surname': surname,
      'billing.country': 'ZA',
      shopperResultUrl: params.urls.success,
      notificationUrl: params.urls.webhook,
      'customParameters[reference]': params.reference,
    };

    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        formData[`customParameters[${key}]`] = String(value);
      }
    }

    const response = await this.apiRequest<any>('POST', '/v1/checkouts', formData);

    if (!response.result?.code.startsWith('000.')) {
      throw new Error(`${response.result?.code}: ${response.result?.description}`);
    }

    const checkoutUrl = `${this.baseUrl}/v1/paymentWidgets.js?checkoutId=${response.id}`;

    return {
      id: response.id,
      checkoutUrl,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      provider: 'peach',
      createdAt: response.timestamp || new Date().toISOString(),
      raw: response,
    };
  }

  /**
   * Peach Payments subscriptions require Registration + scheduled charges flow.
   * This is not yet supported by paybridge. Use Stripe or PayFast for subscriptions.
   */
  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error(
      'Peach Payments subscriptions require Registration + scheduled charges; not yet supported by paybridge. Use Stripe or PayFast for subscriptions.'
    );
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await this.apiRequest<any>('GET', `/v1/checkouts/${id}/payment`, {});

    const status = this.mapPeachStatus(response.result?.code || '');

    return {
      id: response.id,
      checkoutUrl: '',
      status,
      amount: parseFloat(response.amount || '0'),
      currency: response.currency || 'ZAR',
      reference: response.merchantTransactionId || id,
      provider: 'peach',
      createdAt: response.timestamp || new Date().toISOString(),
      raw: response,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const formData: Record<string, any> = {
      paymentType: 'RF',
    };

    if (params.amount !== undefined) {
      formData.amount = params.amount.toFixed(2);
      formData.currency = 'ZAR';
    }

    const response = await this.apiRequest<any>(
      'POST',
      `/v1/payments/${params.paymentId}`,
      formData
    );

    const code = response.result?.code || '';
    let status: 'pending' | 'completed' | 'failed' = 'pending';

    if (code.startsWith('000.') && !code.startsWith('000.200.')) {
      status = 'completed';
    } else if (code.startsWith('000.200.')) {
      status = 'pending';
    } else {
      status = 'failed';
    }

    const currency = response.currency || 'ZAR';

    return {
      id: response.id || `refund_${params.paymentId}_${Date.now()}`,
      status,
      amount: parseFloat(response.amount || String(params.amount || 0)),
      currency,
      paymentId: params.paymentId,
      createdAt: response.timestamp || new Date().toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, headers?: any): WebhookEvent {
    let event: any;

    if (this.webhookSecret && headers) {
      try {
        const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
        const key = Buffer.from(this.webhookSecret, 'hex');
        const iv = Buffer.from(headers['x-initialization-vector'], 'hex');
        const authTag = Buffer.from(headers['x-authentication-tag'], 'hex');
        const ciphertext = Buffer.from(rawBody, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString('utf8');

        event = JSON.parse(plaintext);
      } catch {
        event = typeof body === 'string' ? JSON.parse(body) : body;
      }
    } else {
      event = typeof body === 'string' ? JSON.parse(body) : body;
    }

    const payload = event.payload || event;
    const resultCode = payload.result?.code || '';
    const status = this.mapPeachStatus(resultCode);

    let eventType: WebhookEvent['type'] = 'payment.pending';
    if (status === 'completed') {
      eventType = 'payment.completed';
    } else if (status === 'failed') {
      eventType = 'payment.failed';
    } else if (status === 'cancelled') {
      eventType = 'payment.cancelled';
    }

    return {
      type: eventType,
      payment: {
        id: payload.id || '',
        checkoutUrl: '',
        status,
        amount: parseFloat(payload.amount || '0'),
        currency: payload.currency || 'ZAR',
        reference: payload.merchantTransactionId || '',
        provider: 'peach',
        createdAt: new Date().toISOString(),
      },
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    try {
      const rawBody = typeof body === 'string' ? body : body.toString('utf8');
      const key = Buffer.from(this.webhookSecret, 'hex');
      const iv = Buffer.from(headers['x-initialization-vector'], 'hex');
      const authTag = Buffer.from(headers['x-authentication-tag'], 'hex');
      const ciphertext = Buffer.from(rawBody, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      decipher.update(ciphertext);
      decipher.final();

      return true;
    } catch {
      return false;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 1.0,
        percent: 2.85,
        currency: 'ZAR',
      },
      currencies: this.supportedCurrencies,
      country: 'ZA',
      avgLatencyMs: 600,
    };
  }
}
