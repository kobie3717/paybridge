/**
 * Pesapal payment provider
 * East Africa-focused payment gateway (Kenya, Uganda, Tanzania)
 * @see https://developer.pesapal.com/
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

interface PesapalConfig {
  consumerKey: string;
  consumerSecret: string;
  notificationId?: string;
  username?: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let webhookSecretWarned = false;

export class PesapalProvider extends PaymentProvider {
  readonly name = 'pesapal';
  readonly supportedCurrencies = ['KES', 'UGX', 'TZS', 'USD'];

  private consumerKey: string;
  private consumerSecret: string;
  private notificationId?: string;
  private username?: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl: string;
  private tokenCache?: TokenCache;

  constructor(config: PesapalConfig) {
    super();

    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.notificationId = config.notificationId;
    this.username = config.username;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? false;

    this.baseUrl = this.sandbox
      ? 'https://cybqa.pesapal.com/pesapalv3'
      : 'https://pay.pesapal.com/v3';

    if (this.webhookSecret && !webhookSecretWarned) {
      console.warn(
        '[PayBridge:Pesapal] Pesapal IPN has no webhook signature scheme. Webhook validation relies on getPayment() round-trip. Validate by source IP if possible.'
      );
      webhookSecretWarned = true;
    }
  }

  private async getToken(): Promise<string> {
    const now = Date.now();

    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    const response = await timedFetchOrThrow(`${this.baseUrl}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: this.consumerKey,
        consumer_secret: this.consumerSecret,
      }),
    });

    const data = (await response.json()) as any;

    this.tokenCache = {
      token: data.token,
      expiresAt: now + 4 * 60 * 1000,
    };

    return this.tokenCache.token;
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const token = await this.getToken();
    const url = `${this.baseUrl}${path}`;

    const response = await timedFetchOrThrow(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    return (await response.json()) as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const requestBody: Record<string, any> = {
      id: params.reference,
      currency: params.currency,
      amount: params.amount,
      description: params.description || params.reference,
      callback_url: params.urls.success,
      billing_address: {
        email_address: params.customer.email,
        phone_number: params.customer.phone || '',
        first_name: params.customer.name.split(' ')[0] || params.customer.name,
        last_name: params.customer.name.split(' ').slice(1).join(' ') || '',
      },
    };

    if (this.notificationId) {
      requestBody.notification_id = this.notificationId;
    }

    const response = await this.apiRequest<any>('POST', '/api/Transactions/SubmitOrderRequest', requestBody);

    return {
      id: response.order_tracking_id,
      checkoutUrl: response.redirect_url,
      status: 'pending',
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      reference: response.merchant_reference || params.reference,
      provider: 'pesapal',
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error(
      'Pesapal subscriptions not yet supported by paybridge. Use the Pesapal Recurring Billing API directly.'
    );
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const response = await this.apiRequest<any>('GET', `/api/Transactions/GetTransactionStatus?orderTrackingId=${id}`);

    let status: PaymentStatus = 'pending';
    if (response.payment_status_description === 'Completed') {
      status = 'completed';
    } else if (response.payment_status_description === 'Failed' || response.payment_status_description === 'Invalid') {
      status = 'failed';
    } else if (response.payment_status_description === 'Pending') {
      status = 'pending';
    }

    const currency = (response.currency || 'KES').toUpperCase();
    const amount = response.amount || 0;

    return {
      id,
      checkoutUrl: '',
      status,
      amount,
      currency,
      reference: response.merchant_reference || id,
      provider: 'pesapal',
      createdAt: response.created_date || new Date().toISOString(),
      raw: response,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.username) {
      throw new Error('Pesapal refunds require username config (merchant username)');
    }

    const refundData: Record<string, any> = {
      confirmation_code: params.paymentId,
      username: this.username,
      remarks: params.reason || 'Refund',
    };

    if (params.amount !== undefined) {
      refundData.amount = params.amount;
    }

    const response = await this.apiRequest<any>('POST', '/api/Transactions/RefundRequest', refundData);

    const currency = (response.currency || 'KES').toUpperCase();
    const amount = response.amount || 0;

    return {
      id: response.refund_id || response.id || crypto.randomUUID(),
      status: response.status === 'Success' ? 'completed' : 'pending',
      amount,
      currency,
      paymentId: params.paymentId,
      createdAt: response.created_date || new Date().toISOString(),
      raw: response,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    let orderTrackingId: string;
    let merchantReference: string;

    if (typeof body === 'string') {
      const parsed = new URLSearchParams(body);
      orderTrackingId = parsed.get('OrderTrackingId') || '';
      merchantReference = parsed.get('OrderMerchantReference') || orderTrackingId;
    } else {
      orderTrackingId = body.OrderTrackingId || body.order_tracking_id || '';
      merchantReference = body.OrderMerchantReference || body.merchant_reference || orderTrackingId;
    }

    return {
      type: 'payment.pending',
      payment: {
        id: orderTrackingId,
        checkoutUrl: '',
        status: 'pending',
        amount: 0,
        currency: 'KES',
        reference: merchantReference,
        provider: 'pesapal',
        createdAt: new Date().toISOString(),
      },
      raw: body,
    };
  }

  /**
   * Pesapal IPN has no signature verification scheme.
   * Security comes from:
   * 1. Validating source IP (caller's responsibility)
   * 2. Calling getPayment(id) to verify actual status
   *
   * Always returns true to indicate no validation error (Pesapal design limitation).
   */
  verifyWebhook(_body: string | Buffer, _headers?: any): boolean {
    return true;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 0,
        percent: 3.5,
        currency: 'KES',
      },
      currencies: this.supportedCurrencies,
      country: 'KE',
      avgLatencyMs: 900,
    };
  }
}
