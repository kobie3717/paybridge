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

interface OzowConfig {
  apiKey: string;
  siteCode: string;
  privateKey: string; // For hash generation
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

  constructor(config: OzowConfig) {
    super();

    this.apiKey = config.apiKey;
    this.siteCode = config.siteCode;
    this.privateKey = config.privateKey;
    this.sandbox = config.sandbox;

    // Ozow API endpoints
    if (this.sandbox) {
      this.baseUrl = 'https://stagingapi.ozow.com';
    } else {
      this.baseUrl = 'https://api.ozow.com';
    }
  }

  // ==================== Payment Methods ====================

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    // TODO: Implement Ozow payment creation
    // POST /api/payments
    // Amount in RANDS (not cents)
    // Requires SHA512 hash of concatenated fields
    // Auth: API key in header
    // Body: {
    //   SiteCode: "...",
    //   CountryCode: "ZA",
    //   CurrencyCode: "ZAR",
    //   Amount: "299.00",
    //   TransactionReference: "...",
    //   BankReference: "...",
    //   Customer: "John Doe",
    //   Optional1: "email@example.com",
    //   Optional2: "0825551234",
    //   Optional3: "...",
    //   Optional4: "...",
    //   Optional5: "...",
    //   CancelUrl: "...",
    //   ErrorUrl: "...",
    //   SuccessUrl: "...",
    //   NotifyUrl: "...",
    //   IsTest: true/false,
    //   HashCheck: "sha512_hash"
    // }

    const requestData = {
      SiteCode: this.siteCode,
      CountryCode: 'ZA',
      CurrencyCode: params.currency,
      Amount: params.amount.toFixed(2),
      TransactionReference: params.reference,
      BankReference: params.reference,
      Customer: params.customer.name,
      Optional1: params.customer.email,
      Optional2: params.customer.phone || '',
      Optional3: params.description || '',
      CancelUrl: params.urls.cancel,
      ErrorUrl: params.urls.cancel,
      SuccessUrl: params.urls.success,
      NotifyUrl: params.urls.webhook,
      IsTest: this.sandbox,
      // HashCheck: this.generateHash(...) // TODO: Implement hash generation
    };

    // TODO: Generate SHA512 hash
    // Hash = SHA512(SiteCode + CountryCode + CurrencyCode + Amount + TransactionReference + BankReference + Optional1 + Optional2 + Optional3 + Optional4 + Optional5 + CancelUrl + ErrorUrl + SuccessUrl + NotifyUrl + IsTest + PrivateKey)

    console.warn('[PayBridge:Ozow] createPayment not yet implemented:', requestData);

    throw new Error('Ozow provider not yet fully implemented. Coming soon!');
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    // TODO: Implement Ozow recurring payments
    // Ozow supports recurring payments via their recurring payment API
    // Different endpoint and structure from one-time payments

    console.warn('[PayBridge:Ozow] createSubscription not yet implemented');

    throw new Error('Ozow subscriptions not yet implemented. Coming soon!');
  }

  async getPayment(id: string): Promise<PaymentResult> {
    // TODO: Implement Ozow payment status check
    // GET /api/payments/{transactionReference}
    // Auth: API key in header

    console.warn('[PayBridge:Ozow] getPayment not yet implemented:', id);

    throw new Error('Ozow getPayment not yet implemented. Coming soon!');
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    // TODO: Implement Ozow refund
    // POST /api/refunds
    // Auth: API key in header
    // Body: {
    //   SiteCode: "...",
    //   TransactionReference: "...",
    //   Amount: "299.00", // optional for partial
    //   HashCheck: "..."
    // }

    console.warn('[PayBridge:Ozow] refund not yet implemented:', params);

    throw new Error('Ozow refunds not yet implemented. Coming soon!');
  }

  // ==================== Webhooks ====================

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    // TODO: Map Ozow webhook structure to PayBridge WebhookEvent
    // Ozow webhook payload structure (form data):
    // {
    //   SiteCode: "...",
    //   TransactionId: "...",
    //   TransactionReference: "...",
    //   Amount: "299.00",
    //   Status: "Complete" | "Cancelled" | "Error" | "Abandoned",
    //   Optional1: "...",
    //   Optional2: "...",
    //   Optional3: "...",
    //   Optional4: "...",
    //   Optional5: "...",
    //   CurrencyCode: "ZAR",
    //   IsTest: "true" | "false",
    //   StatusMessage: "...",
    //   Hash: "sha512_hash"
    // }

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

  verifyWebhook(body: any, _headers?: any): boolean {
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    const receivedHash = event.Hash;

    if (!receivedHash) {
      // No hash provided
      return true;
    }

    // TODO: Verify Ozow SHA512 hash
    // expectedHash = SHA512(SiteCode + TransactionId + TransactionReference + Amount + Status + Optional1 + Optional2 + Optional3 + Optional4 + Optional5 + CurrencyCode + IsTest + StatusMessage + PrivateKey)

    const expectedHash = this.generateWebhookHash(event);

    return receivedHash === expectedHash;
  }

  // ==================== Helpers ====================

  private mapOzowStatus(ozowStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      Complete: 'completed',
      Cancelled: 'cancelled',
      Error: 'failed',
      Abandoned: 'cancelled',
      PendingInvestigation: 'pending',
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

  private generateWebhookHash(event: any): string {
    // TODO: Implement SHA512 hash generation for webhook verification
    const fields = [
      event.SiteCode,
      event.TransactionId,
      event.TransactionReference,
      event.Amount,
      event.Status,
      event.Optional1 || '',
      event.Optional2 || '',
      event.Optional3 || '',
      event.Optional4 || '',
      event.Optional5 || '',
      event.CurrencyCode,
      event.IsTest,
      event.StatusMessage || '',
      this.privateKey,
    ];

    const concatenated = fields.join('');
    return crypto.createHash('sha512').update(concatenated, 'utf8').digest('hex').toLowerCase();
  }
}
