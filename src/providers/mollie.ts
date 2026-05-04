/**
 * Mollie payment provider
 * EU-focused payment gateway supporting 9 currencies
 * @see https://docs.mollie.com/reference
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

interface MollieConfig {
  apiKey: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

let webhookSecretWarned = false;

export class MollieProvider extends PaymentProvider {
  readonly name = 'mollie';
  readonly supportedCurrencies = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'DKK', 'SEK', 'NOK'];

  private apiKey: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl = 'https://api.mollie.com/v2';

  constructor(config: MollieConfig) {
    super();

    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? this.apiKey.startsWith('test_');

    if (this.webhookSecret && !webhookSecretWarned) {
      console.warn(
        '[PayBridge:Mollie] Mollie has no webhook signature scheme. Webhook validation relies on getPayment() round-trip. Validate by source IP if possible.'
      );
      webhookSecretWarned = true;
    }
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await timedFetchOrThrow(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    return (await response.json()) as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const requestBody = {
      amount: {
        value: params.amount.toFixed(2),
        currency: params.currency,
      },
      description: params.description || params.reference,
      redirectUrl: params.urls.success,
      cancelUrl: params.urls.cancel,
      webhookUrl: params.urls.webhook,
      metadata: {
        reference: params.reference,
        ...params.metadata,
      },
    };

    const response = await this.apiRequest<any>('POST', '/payments', requestBody);

    return {
      id: response.id,
      checkoutUrl: response._links.checkout.href,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      reference: params.reference,
      provider: 'mollie',
      createdAt: response.createdAt || new Date().toISOString(),
      raw: response,
    };
  }

  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error(
      'Mollie subscriptions require Customer + Mandate setup; not yet supported by paybridge. Use the Mollie Customers API directly or choose another provider.'
    );
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await this.apiRequest<any>('GET', `/payments/${id}`);

    let status: PaymentStatus = 'pending';
    if (response.status === 'paid') {
      status = 'completed';
    } else if (response.status === 'failed' || response.status === 'expired') {
      status = 'failed';
    } else if (response.status === 'canceled') {
      status = 'cancelled';
    } else if (response.status === 'open' || response.status === 'pending') {
      status = 'pending';
    }

    const currency = (response.amount?.currency || 'EUR').toUpperCase();
    const amount = response.amount?.value ? parseFloat(response.amount.value) : 0;

    return {
      id: response.id,
      checkoutUrl: response._links?.checkout?.href || '',
      status,
      amount,
      currency,
      reference: response.metadata?.reference || response.id,
      provider: 'mollie',
      createdAt: response.createdAt || new Date().toISOString(),
      raw: response,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundData: Record<string, any> = {
      description: params.reason || 'Refund',
    };

    if (params.amount !== undefined) {
      const currency = 'EUR';
      refundData.amount = {
        value: params.amount.toFixed(2),
        currency,
      };
    }

    const response = await this.apiRequest<any>('POST', `/payments/${params.paymentId}/refunds`, refundData);

    const currency = (response.amount?.currency || 'EUR').toUpperCase();
    const amount = response.amount?.value ? parseFloat(response.amount.value) : 0;

    let refundStatus: 'pending' | 'completed' | 'failed' = 'pending';
    if (response.status === 'refunded') {
      refundStatus = 'completed';
    } else if (response.status === 'failed') {
      refundStatus = 'failed';
    }

    return {
      id: response.id,
      status: refundStatus,
      amount,
      currency,
      paymentId: params.paymentId,
      createdAt: response.createdAt || new Date().toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    let paymentId: string;

    if (typeof body === 'string') {
      const parsed = new URLSearchParams(body);
      paymentId = parsed.get('id') || '';
    } else {
      paymentId = body.id || '';
    }

    return {
      type: 'payment.pending',
      payment: {
        id: paymentId,
        checkoutUrl: '',
        status: 'pending',
        amount: 0,
        currency: 'EUR',
        reference: paymentId,
        provider: 'mollie',
        createdAt: new Date().toISOString(),
      },
      raw: body,
    };
  }

  /**
   * Mollie webhooks have no signature verification scheme.
   * Security comes from:
   * 1. Validating source IP (caller's responsibility)
   * 2. Calling getPayment(id) to verify actual status
   *
   * Always returns true to indicate no validation error (Mollie design limitation).
   */
  verifyWebhook(_body: string | Buffer, _headers?: any): boolean {
    return true;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 0.25,
        percent: 1.8,
        currency: 'EUR',
      },
      currencies: this.supportedCurrencies,
      country: 'EU',
      avgLatencyMs: 350,
    };
  }
}
