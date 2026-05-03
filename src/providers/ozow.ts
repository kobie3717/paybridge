/**
 * Ozow payment provider
 * South African instant EFT payment gateway
 * @see https://hub.ozow.com
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

interface OzowConfig {
  apiKey: string;
  siteCode: string;
  privateKey: string;
  sandbox: boolean;
}

export class OzowProvider extends PaymentProvider {
  readonly name = 'ozow';
  readonly supportedCurrencies = ['ZAR'];

  private apiKey: string;
  private siteCode: string;
  private privateKey: string;
  private sandbox: boolean;
  private baseUrl: string;
  private redirectBaseUrl: string;

  constructor(config: OzowConfig) {
    super();

    this.apiKey = config.apiKey;
    this.siteCode = config.siteCode;
    this.privateKey = config.privateKey;
    this.sandbox = config.sandbox;

    this.baseUrl = 'https://api.ozow.com';
    this.redirectBaseUrl = this.sandbox
      ? 'https://stagingpay.ozow.com'
      : 'https://pay.ozow.com';
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    const bankReference = this.sanitizeBankReference(params.reference);

    const fields: Record<string, string> = {
      SiteCode: this.siteCode,
      CountryCode: 'ZA',
      CurrencyCode: params.currency,
      Amount: params.amount.toFixed(2),
      TransactionReference: params.reference,
      BankReference: bankReference,
      Customer: params.customer.name || '',
      CancelUrl: params.urls.cancel,
      ErrorUrl: params.urls.cancel,
      SuccessUrl: params.urls.success,
      NotifyUrl: params.urls.webhook,
      IsTest: this.sandbox ? 'true' : 'false',
    };

    const fieldOrder = [
      'SiteCode',
      'CountryCode',
      'CurrencyCode',
      'Amount',
      'TransactionReference',
      'BankReference',
      'Customer',
      'CancelUrl',
      'ErrorUrl',
      'SuccessUrl',
      'NotifyUrl',
      'IsTest',
    ];

    const hashCheck = this.generateHash(fields, fieldOrder);

    const queryParams = new URLSearchParams();
    fieldOrder.forEach(key => {
      queryParams.append(key, fields[key]);
    });
    queryParams.append('HashCheck', hashCheck);

    const checkoutUrl = `${this.redirectBaseUrl}?${queryParams.toString()}`;

    return {
      id: params.reference,
      checkoutUrl,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      provider: 'ozow',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Ozow does not support recurring subscriptions (EFT instant-payment provider)
   * Use a card-based provider for subscription functionality
   */
  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    throw new Error('Ozow does not support recurring subscriptions. EFT-based provider; use card-based provider for subscriptions.');
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const url = `${this.baseUrl}/GetTransactionByReference?siteCode=${this.siteCode}&transactionReference=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'ApiKey': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ozow getPayment failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Transaction not found');
    }

    const transaction = data[0];
    const status = this.mapOzowStatus(transaction.status);

    return {
      id: transaction.transactionId || id,
      checkoutUrl: '',
      status,
      amount: parseFloat(transaction.amount || '0'),
      currency: transaction.currencyCode || 'ZAR',
      reference: transaction.transactionReference || id,
      provider: 'ozow',
      createdAt: transaction.createdDate || new Date().toISOString(),
      raw: transaction,
    };
  }

  /**
   * Ozow refunds require manual processing via merchant portal
   * No public API endpoint for instant-EFT refunds
   */
  async refund(_params: RefundParams): Promise<RefundResult> {
    throw new Error('Ozow refunds must be processed manually via merchant.ozow.com — no API support.');
  }

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    let event: any;

    if (typeof body === 'string') {
      const params = new URLSearchParams(body);
      event = Object.fromEntries(params.entries());
    } else {
      event = body;
    }

    const ozowStatus = event.Status;
    const status: PaymentStatus = this.mapOzowStatus(ozowStatus);
    const eventType = this.mapOzowEventType(ozowStatus);

    return {
      type: eventType,
      payment: {
        id: event.TransactionId || event.TransactionReference,
        checkoutUrl: '',
        status,
        amount: parseFloat(event.Amount || '0'),
        currency: event.CurrencyCode || 'ZAR',
        reference: event.TransactionReference,
        provider: 'ozow',
        createdAt: new Date().toISOString(),
      },
      raw: event,
    };
  }

  /**
   * Verify Ozow ITN webhook signature
   * Note: Ozow ITN has no timestamp, so no replay protection possible
   * Caller should validate idempotency by TransactionId
   */
  verifyWebhook(body: any, _headers?: any): boolean {
    if (!this.apiKey) {
      return false;
    }

    let event: any;

    if (typeof body === 'string') {
      const params = new URLSearchParams(body);
      event = Object.fromEntries(params.entries());
    } else {
      event = body;
    }

    const receivedHash = event.Hash;

    if (!receivedHash) {
      return false;
    }

    const expectedHash = this.generateWebhookHash(event);

    try {
      const receivedBuffer = Buffer.from(receivedHash);
      const expectedBuffer = Buffer.from(expectedHash);

      if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  // ==================== Capabilities ====================

  getCapabilities(): ProviderCapabilities {
    return {
      fees: {
        fixed: 0,
        percent: 1.5,
        currency: 'ZAR',
      },
      currencies: this.supportedCurrencies,
      country: 'ZA',
      avgLatencyMs: 800,
    };
  }

  private mapOzowStatus(ozowStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      Complete: 'completed',
      Cancelled: 'cancelled',
      Error: 'failed',
      Abandoned: 'cancelled',
      PendingInvestigation: 'pending',
      Pending: 'pending',
    };

    return statusMap[ozowStatus] || 'pending';
  }

  private mapOzowEventType(ozowStatus: string): WebhookEvent['type'] {
    const typeMap: Record<string, WebhookEvent['type']> = {
      Complete: 'payment.completed',
      Cancelled: 'payment.cancelled',
      Error: 'payment.failed',
      Abandoned: 'payment.cancelled',
    };

    return typeMap[ozowStatus] || 'payment.pending';
  }

  private generateHash(fields: Record<string, string>, fieldOrder: string[]): string {
    const concat = fieldOrder.map(k => fields[k] ?? '').join('') + this.apiKey;
    return crypto.createHash('sha512').update(concat.toLowerCase()).digest('hex');
  }

  private generateWebhookHash(event: any): string {
    const fieldOrder = [
      'SiteCode',
      'TransactionId',
      'TransactionReference',
      'Amount',
      'Status',
      'Optional1',
      'Optional2',
      'Optional3',
      'Optional4',
      'Optional5',
      'CurrencyCode',
      'IsTest',
      'StatusMessage',
    ];

    const fields: Record<string, string> = {};
    fieldOrder.forEach(key => {
      fields[key] = event[key] || '';
    });

    const concat = fieldOrder.map(k => fields[k]).join('') + this.apiKey;
    return crypto.createHash('sha512').update(concat.toLowerCase()).digest('hex');
  }

  private sanitizeBankReference(reference: string): string {
    const sanitized = reference.replace(/[^A-Za-z0-9]/g, '').substring(0, 20);

    if (sanitized.length === 0) {
      throw new Error('Ozow BankReference invalid: must contain at least 1 alphanumeric char');
    }

    return sanitized;
  }
}
