/**
 * PayFast payment provider
 * South African payment gateway (hosted checkout + ITN webhooks)
 * @see https://developers.payfast.co.za
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
import { ProviderCapabilities } from '../routing-types';

interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase?: string;
  sandbox: boolean;
  webhookSecret?: string;
}

export class PayFastProvider extends PaymentProvider {
  readonly name = 'payfast';
  readonly supportedCurrencies = ['ZAR'];

  private merchantId: string;
  private merchantKey: string;
  private passphrase?: string;
  private sandbox: boolean;
  private checkoutBaseUrl: string;
  private apiBaseUrl: string;

  constructor(config: PayFastConfig) {
    super();

    this.merchantId = config.merchantId;
    this.merchantKey = config.merchantKey;
    this.passphrase = config.passphrase || config.webhookSecret;
    this.sandbox = config.sandbox;

    if (this.sandbox) {
      this.checkoutBaseUrl = 'https://sandbox.payfast.co.za/eng/process';
      this.apiBaseUrl = 'https://api.payfast.co.za';
    } else {
      this.checkoutBaseUrl = 'https://www.payfast.co.za/eng/process';
      this.apiBaseUrl = 'https://api.payfast.co.za';
    }
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const nameParts = params.customer.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const paymentParams: Record<string, string> = {
      merchant_id: this.merchantId,
      merchant_key: this.merchantKey,
      return_url: params.urls.success,
      cancel_url: params.urls.cancel,
      notify_url: params.urls.webhook,
      name_first: firstName,
      name_last: lastName,
      email_address: params.customer.email,
      m_payment_id: params.reference,
      amount: params.amount.toFixed(2),
      item_name: params.description || params.reference,
      item_description: params.description || '',
    };

    if (params.metadata) {
      const metaKeys = Object.keys(params.metadata).slice(0, 5);
      metaKeys.forEach((key, idx) => {
        paymentParams[`custom_str${idx + 1}`] = String(params.metadata![key]);
      });
    }

    const signature = this.generateSignature(paymentParams);
    const queryParams = this.buildQueryString(paymentParams);
    const checkoutUrl = `${this.checkoutBaseUrl}?${queryParams}&signature=${signature}`;

    return {
      id: params.reference,
      checkoutUrl,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      provider: 'payfast',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    const frequencyMap: Record<string, number> = {
      monthly: 3,
      yearly: 6,
    };

    const frequency = frequencyMap[params.interval];
    if (!frequency) {
      throw new Error(`PayFast does not support ${params.interval} subscriptions. Use monthly or yearly.`);
    }

    let billingDate: Date;
    if (params.startDate) {
      this.validateFutureDate(params.startDate, 'startDate');
      billingDate = new Date(params.startDate);
    } else {
      billingDate = new Date();
      billingDate.setDate(billingDate.getDate() + 1);
    }

    const nameParts = params.customer.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const subscriptionParams: Record<string, string> = {
      merchant_id: this.merchantId,
      merchant_key: this.merchantKey,
      return_url: params.urls.success,
      cancel_url: params.urls.cancel,
      notify_url: params.urls.webhook,
      name_first: firstName,
      name_last: lastName,
      email_address: params.customer.email,
      m_payment_id: params.reference,
      amount: params.amount.toFixed(2),
      item_name: params.description || params.reference,
      item_description: params.description || '',
      subscription_type: '1',
      billing_date: billingDate.toISOString().split('T')[0],
      recurring_amount: params.amount.toFixed(2),
      frequency: String(frequency),
      cycles: '0',
    };

    if (params.metadata) {
      const metaKeys = Object.keys(params.metadata).slice(0, 5);
      metaKeys.forEach((key, idx) => {
        subscriptionParams[`custom_str${idx + 1}`] = String(params.metadata![key]);
      });
    }

    const signature = this.generateSignature(subscriptionParams);
    const queryParams = this.buildQueryString(subscriptionParams);
    const checkoutUrl = `${this.checkoutBaseUrl}?${queryParams}&signature=${signature}`;

    return {
      id: params.reference,
      checkoutUrl,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      interval: params.interval,
      reference: params.reference,
      provider: 'payfast',
      startsAt: billingDate.toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    // TODO: verify against latest PayFast Query API docs
    const timestamp = new Date().toISOString();
    const headers: Record<string, string> = {
      'merchant-id': this.merchantId,
      'version': 'v1',
      'timestamp': timestamp,
    };

    headers['signature'] = this.generateApiSignature(headers);

    const testingParam = this.sandbox ? '?testing=true' : '';
    const url = `${this.apiBaseUrl}/query/fetch${testingParam}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        m_payment_id: id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PayFast getPayment failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
    const status = this.mapPayFastStatus((data as any).status);

    return {
      id: (data as any).pf_payment_id || id,
      checkoutUrl: '',
      status,
      amount: parseFloat((data as any).amount_gross || '0'),
      currency: 'ZAR',
      reference: (data as any).m_payment_id || id,
      provider: 'payfast',
      createdAt: (data as any).created_at || new Date().toISOString(),
      raw: data,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    // TODO: verify against latest PayFast Query API docs
    const timestamp = new Date().toISOString();
    const headers: Record<string, string> = {
      'merchant-id': this.merchantId,
      'version': 'v1',
      'timestamp': timestamp,
    };

    headers['signature'] = this.generateApiSignature(headers);

    const testingParam = this.sandbox ? '?testing=true' : '';
    const url = `${this.apiBaseUrl}/refunds/${params.paymentId}${testingParam}`;

    const refundData: any = {
      merchant_reference: params.paymentId,
    };

    if (params.amount !== undefined) {
      refundData.amount = params.amount.toFixed(2);
    }

    if (params.reason) {
      refundData.reason = params.reason;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(refundData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PayFast refund failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;

    return {
      id: (data as any).refund_id || `refund_${params.paymentId}_${Date.now()}`,
      status: (data as any).status === 'success' ? 'completed' : 'pending',
      amount: params.amount || 0,
      currency: 'ZAR',
      paymentId: params.paymentId,
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    let event: any;

    if (typeof body === 'string') {
      const params = new URLSearchParams(body);
      event = Object.fromEntries(params.entries());
    } else {
      event = body;
    }

    const paymentStatus = event.payment_status || 'PENDING';
    const status = this.mapPayFastStatus(paymentStatus);
    const eventType = this.mapEventType(paymentStatus);

    return {
      type: eventType,
      payment: {
        id: event.pf_payment_id || event.m_payment_id,
        checkoutUrl: '',
        status,
        amount: parseFloat(event.amount_gross || '0'),
        currency: 'ZAR',
        reference: event.m_payment_id,
        provider: 'payfast',
        createdAt: new Date().toISOString(),
      },
      raw: event,
    };
  }

  verifyWebhook(body: any, _headers?: any): boolean {
    if (!this.passphrase) {
      return false;
    }

    let event: any;
    let params: [string, string][];

    if (typeof body === 'string') {
      const urlParams = new URLSearchParams(body);
      event = Object.fromEntries(urlParams.entries());
      params = Array.from(urlParams.entries());
    } else {
      event = body;
      params = Object.entries(body) as [string, string][];
    }

    const receivedSignature = event.signature;
    if (!receivedSignature) {
      return false;
    }

    const filteredParams = params
      .filter(([key]) => key !== 'signature')
      .map(([key, value]) => `${key}=${this.pfEncode(String(value))}`)
      .join('&');

    const signatureString = `${filteredParams}&passphrase=${this.pfEncode(this.passphrase)}`;
    const expectedSignature = crypto.createHash('md5').update(signatureString).digest('hex');

    try {
      const receivedBuffer = Buffer.from(receivedSignature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 2.0,
        percent: 2.9,
        currency: 'ZAR',
      },
      currencies: this.supportedCurrencies,
      country: 'ZA',
      avgLatencyMs: 600,
    };
  }

  private pfEncode(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }

  private generateSignature(params: Record<string, string>): string {
    const filtered = Object.entries(params)
      .filter(([_, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${this.pfEncode(String(v))}`)
      .join('&');

    const signatureString = this.passphrase
      ? `${filtered}&passphrase=${this.pfEncode(this.passphrase)}`
      : filtered;

    return crypto.createHash('md5').update(signatureString).digest('hex');
  }

  private buildQueryString(params: Record<string, string>): string {
    return Object.entries(params)
      .filter(([_, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${this.pfEncode(String(v))}`)
      .join('&');
  }

  private generateApiSignature(headers: Record<string, string>): string {
    const sortedKeys = Object.keys(headers)
      .filter(k => k !== 'signature')
      .sort();

    const paramString = sortedKeys
      .map(k => `${k}=${encodeURIComponent(headers[k])}`)
      .join('&');

    const signatureString = this.passphrase
      ? `${paramString}&passphrase=${encodeURIComponent(this.passphrase)}`
      : paramString;

    return crypto.createHash('md5').update(signatureString).digest('hex');
  }

  private mapPayFastStatus(status: string): PaymentStatus {
    const upperStatus = String(status).toUpperCase();

    switch (upperStatus) {
      case 'COMPLETE':
        return 'completed';
      case 'FAILED':
        return 'failed';
      case 'CANCELLED':
        return 'cancelled';
      case 'PENDING':
        return 'pending';
      default:
        return 'pending';
    }
  }

  private mapEventType(status: string): WebhookEvent['type'] {
    const upperStatus = String(status).toUpperCase();

    switch (upperStatus) {
      case 'COMPLETE':
        return 'payment.completed';
      case 'FAILED':
        return 'payment.failed';
      case 'CANCELLED':
        return 'payment.cancelled';
      case 'PENDING':
        return 'payment.pending';
      default:
        return 'payment.pending';
    }
  }
}
