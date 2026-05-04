/**
 * Adyen payment provider
 * Global payment platform supporting 150+ countries
 * @see https://docs.adyen.com/api-explorer/Checkout/71/overview
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

interface AdyenConfig {
  apiKey: string;
  merchantAccount: string;
  liveUrlPrefix?: string;
  webhookSecret?: string;
  sandbox?: boolean;
}

export class AdyenProvider extends PaymentProvider {
  readonly name = 'adyen';
  readonly supportedCurrencies = ['ZAR', 'EUR', 'USD', 'GBP', 'AUD', 'BRL', 'INR', 'NGN'];

  private apiKey: string;
  private merchantAccount: string;
  private liveUrlPrefix?: string;
  private webhookSecret?: string;
  private sandbox: boolean;
  private baseUrl: string;

  constructor(config: AdyenConfig) {
    super();

    this.apiKey = config.apiKey;
    this.merchantAccount = config.merchantAccount;
    this.liveUrlPrefix = config.liveUrlPrefix;
    this.webhookSecret = config.webhookSecret;
    this.sandbox = config.sandbox ?? true;

    if (this.sandbox) {
      this.baseUrl = 'https://checkout-test.adyen.com/v71';
    } else {
      if (!this.liveUrlPrefix) {
        throw new Error('Adyen live mode requires liveUrlPrefix');
      }
      this.baseUrl = `https://checkout-${this.liveUrlPrefix}.adyenpayments.com/v71`;
    }
  }

  private async apiRequest<T = any>(method: string, path: string, data?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await timedFetchOrThrow(url, {
      method,
      headers: {
        'x-API-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    return (await response.json()) as T;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const amountInMinorUnits = toMinorUnit(params.amount, params.currency);

    const [firstName, ...lastNameParts] = params.customer.name.split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    const sessionData = {
      amount: {
        value: amountInMinorUnits,
        currency: params.currency,
      },
      merchantAccount: this.merchantAccount,
      reference: params.reference,
      returnUrl: params.urls.success,
      shopperEmail: params.customer.email,
      shopperName: {
        firstName,
        lastName,
      },
      countryCode: 'ZA',
      metadata: {
        reference: params.reference,
        ...(params.metadata || {}),
      },
    };

    const response = await this.apiRequest<any>('POST', '/sessions', sessionData);

    return {
      id: response.id,
      checkoutUrl: response.url,
      status: 'pending',
      amount: toMajorUnit(response.amount.value, params.currency),
      currency: response.amount.currency,
      reference: params.reference,
      provider: 'adyen',
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  /**
   * Adyen subscriptions require recurring tokenization flow (shopperReference + recurring contract).
   * This is not yet supported by paybridge's simple checkout URL model.
   * Use Stripe or PayFast for subscriptions.
   */
  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error(
      'Adyen subscriptions require recurring tokenization flow; not yet supported by paybridge. Use Stripe or PayFast for subscriptions.'
    );
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const session = await this.apiRequest<any>('GET', `/sessions/${id}`);

    let status: PaymentStatus = 'pending';
    if (session.status === 'completed') {
      status = 'completed';
    } else if (session.status === 'paymentPending' || session.status === 'pending') {
      status = 'pending';
    } else if (session.status === 'expired') {
      status = 'cancelled';
    } else if (session.status === 'refused' || session.status === 'error') {
      status = 'failed';
    }

    const currency = session.amount?.currency || 'EUR';

    return {
      id: session.id,
      checkoutUrl: session.url || '',
      status,
      amount: toMajorUnit(session.amount?.value || 0, currency),
      currency,
      reference: session.reference || session.id,
      provider: 'adyen',
      createdAt: new Date().toISOString(),
      raw: session,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundData: Record<string, any> = {
      merchantAccount: this.merchantAccount,
      reference: `refund-${params.paymentId}-${Date.now()}`,
    };

    if (params.amount !== undefined) {
      refundData.amount = {
        value: toMinorUnit(params.amount, 'EUR'),
        currency: 'EUR',
      };
    }

    const response = await this.apiRequest<any>('POST', `/payments/${params.paymentId}/refunds`, refundData);

    const currency = response.amount?.currency || 'EUR';

    return {
      id: response.pspReference,
      status: response.status === 'received' ? 'pending' : 'completed',
      amount: toMajorUnit(response.amount?.value || 0, currency),
      currency,
      paymentId: params.paymentId,
      createdAt: new Date().toISOString(),
      raw: response,
    };
  }

  /**
   * Parse Adyen webhook notification.
   * Note: Adyen webhooks contain multiple notificationItems in a batch.
   * This method returns only the FIRST item (paybridge webhook interface is single-event).
   * Multi-event batches require custom handling outside paybridge.
   */
  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    const notificationItems = event.notificationItems || [];
    if (notificationItems.length === 0) {
      throw new Error('Adyen webhook contains no notificationItems');
    }

    const item = notificationItems[0].NotificationRequestItem;

    const typeMap: Record<string, WebhookEvent['type']> = {
      AUTHORISATION: item.success === 'true' ? 'payment.completed' : 'payment.failed',
      CANCELLATION: 'payment.cancelled',
      REFUND: item.success === 'true' ? 'refund.completed' : 'payment.failed',
    };

    const eventType = typeMap[item.eventCode] || 'payment.pending';
    const currency = item.amount?.currency || 'EUR';

    let payment: PaymentResult | undefined;
    let refund: RefundResult | undefined;

    if (item.eventCode === 'AUTHORISATION') {
      payment = {
        id: item.pspReference,
        checkoutUrl: '',
        status: item.success === 'true' ? 'completed' : 'failed',
        amount: toMajorUnit(item.amount?.value || 0, currency),
        currency,
        reference: item.merchantReference,
        provider: 'adyen',
        createdAt: new Date().toISOString(),
      };
    } else if (item.eventCode === 'REFUND') {
      refund = {
        id: item.pspReference,
        status: item.success === 'true' ? 'completed' : 'failed',
        amount: toMajorUnit(item.amount?.value || 0, currency),
        currency,
        paymentId: item.originalReference || item.pspReference,
        createdAt: new Date().toISOString(),
      };
    } else if (item.eventCode === 'CANCELLATION') {
      payment = {
        id: item.pspReference,
        checkoutUrl: '',
        status: 'cancelled',
        amount: toMajorUnit(item.amount?.value || 0, currency),
        currency,
        reference: item.merchantReference,
        provider: 'adyen',
        createdAt: new Date().toISOString(),
      };
    }

    return {
      type: eventType,
      payment,
      refund,
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, _headers?: any): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const event = typeof body === 'string' ? JSON.parse(body) : JSON.parse(body.toString('utf8'));
    const notificationItems = event.notificationItems || [];
    if (notificationItems.length === 0) {
      return false;
    }

    const item = notificationItems[0].NotificationRequestItem;
    const hmacSignature = item.additionalData?.hmacSignature;

    if (!hmacSignature) {
      return false;
    }

    const signedFields = [
      item.pspReference || '',
      item.originalReference || '',
      item.merchantAccountCode || this.merchantAccount,
      item.merchantReference || '',
      String(item.amount?.value || ''),
      item.amount?.currency || '',
      item.eventCode || '',
      item.success || '',
    ];

    const signedString = signedFields.join('|');

    const hmacKey = Buffer.from(this.webhookSecret, 'hex');
    const computedSig = crypto.createHmac('sha256', hmacKey).update(signedString, 'utf8').digest('base64');

    try {
      const computedBuffer = Buffer.from(computedSig, 'utf8');
      const expectedBuffer = Buffer.from(hmacSignature, 'utf8');

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
        fixed: 0.11,
        percent: 0.6,
        currency: 'EUR',
      },
      currencies: this.supportedCurrencies,
      country: 'GLOBAL',
      avgLatencyMs: 250,
    };
  }
}
