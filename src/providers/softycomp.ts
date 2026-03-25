/**
 * SoftyComp payment provider
 * South African bill presentment and debit order platform
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

interface SoftyCompConfig {
  apiKey: string;
  secretKey: string;
  sandbox: boolean;
  webhookSecret?: string;
}

interface TokenResponse {
  token: string;
  expiration: string;
}

interface BillResponse {
  reference: string;
  paymentURL: string;
  success: boolean;
  message: string;
}

export class SoftyCompProvider extends PaymentProvider {
  readonly name = 'softycomp';
  readonly supportedCurrencies = ['ZAR'];

  private apiKey: string;
  private secretKey: string;
  private sandbox: boolean;
  private baseUrl: string;
  private webhookSecret?: string;

  // Token cache
  private token: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: SoftyCompConfig) {
    super();

    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.sandbox = config.sandbox;
    this.webhookSecret = config.webhookSecret;

    // Base URL mapping
    if (this.sandbox) {
      this.baseUrl = 'https://sandbox.softycomp.co.za/SoftyCompBureauAPI';
    } else {
      this.baseUrl = 'https://api.softycomp.co.za/SoftyCompBureauAPI';
    }
  }

  // ==================== Authentication ====================

  private async authenticate(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.token && Date.now() < this.tokenExpiry - 60_000) {
      return this.token;
    }

    const response = await fetch(`${this.baseUrl}/api/auth/generatetoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: this.apiKey,
        apiSecret: this.secretKey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SoftyComp authentication failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.token = data.token;
    this.tokenExpiry = new Date(data.expiration).getTime();
    return this.token;
  }

  private async apiRequest<T = any>(method: string, path: string, data?: any): Promise<T> {
    const token = await this.authenticate();
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SoftyComp API error (${method} ${path}): ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  // ==================== Payment Methods ====================

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    this.validateCurrency(params.currency);

    // Build the bill item (once-off payment)
    const item = {
      Description: params.description || 'Payment',
      Amount: parseFloat(params.amount.toFixed(2)),
      FrequencyTypeID: 1, // Once-off
      DisplayCompanyName: 'Your Company',
      DisplayCompanyContactNo: '',
      DisplayCompanyEmailAddress: params.customer.email,
    };

    // Build the bill request
    const billData = {
      Name: params.customer.name,
      ModeTypeID: 4, // Plugin mode (returns payment URL)
      Emailaddress: params.customer.email,
      Cellno: params.customer.phone || '',
      UserReference: params.reference,
      Items: [item],
      ScheduledDateTime: null,
      CallbackUrl: params.urls.webhook,
      SuccessURL: params.urls.success,
      FailURL: params.urls.cancel,
      NotifyURL: params.urls.webhook,
      CancelURL: params.urls.cancel,
    };

    const result = await this.apiRequest<BillResponse>(
      'POST',
      '/api/paygatecontroller/requestbillpresentment',
      billData
    );

    if (!result.success) {
      throw new Error(`Failed to create payment: ${result.message}`);
    }

    return {
      id: result.reference,
      checkoutUrl: result.paymentURL,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      provider: 'softycomp',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      raw: result,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    this.validateCurrency(params.currency);

    // Map interval to SoftyComp frequency from official docs:
    // 1=Once Off, 2=Monthly, 3=Weekly, 4=Yearly, 5=To Collect Amount, 6=Subscription
    const frequencyMap: Record<string, number> = {
      'weekly': 3, 'monthly': 2, 'yearly': 4
    };
    const frequencyTypeID = frequencyMap[params.interval];
    if (!frequencyTypeID) {
      throw new Error(`SoftyComp does not support ${params.interval} subscriptions. Use weekly, monthly, or yearly.`);
    }

    // Parse and validate start date
    let startDate: Date;
    if (params.startDate) {
      this.validateFutureDate(params.startDate, 'startDate');
      startDate = new Date(params.startDate);
    } else {
      // Default to tomorrow
      startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
    }

    // Build the bill item (recurring)
    const item: Record<string, any> = {
      Description: params.description || 'Subscription',
      Amount: parseFloat(params.amount.toFixed(2)),
      FrequencyTypeID: frequencyTypeID,
      DisplayCompanyName: 'Your Company',
      DisplayCompanyContactNo: '',
      DisplayCompanyEmailAddress: params.customer.email,
      CommencementDate: startDate.toISOString().split('T')[0],
      RecurringDay: params.billingDay || startDate.getDate(),
      RecurringMonth: params.interval === 'yearly' ? startDate.getMonth() + 1 : null,
      DayOfWeek: null,
      ExpiryDate: null,
      InitialAmount: null,
      ToCollectAmount: null,
    };

    // Build the bill request
    const billData = {
      Name: params.customer.name,
      ModeTypeID: 4,
      Emailaddress: params.customer.email,
      Cellno: params.customer.phone || '',
      UserReference: params.reference,
      Items: [item],
      ScheduledDateTime: null,
      CallbackUrl: params.urls.webhook,
      SuccessURL: params.urls.success,
      FailURL: params.urls.cancel,
      NotifyURL: params.urls.webhook,
      CancelURL: params.urls.cancel,
    };

    const result = await this.apiRequest<BillResponse>(
      'POST',
      '/api/paygatecontroller/requestbillpresentment',
      billData
    );

    if (!result.success) {
      throw new Error(`Failed to create subscription: ${result.message}`);
    }

    return {
      id: result.reference,
      checkoutUrl: result.paymentURL,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      interval: params.interval,
      reference: params.reference,
      provider: 'softycomp',
      startsAt: startDate.toISOString(),
      createdAt: new Date().toISOString(),
      raw: result,
    };
  }

  async getPayment(id: string): Promise<PaymentResult> {
    const result = await this.apiRequest<any>(
      'GET',
      `/api/paygatecontroller/listBillPresentmentDetails/${id}/${id}`
    );

    // Map status: 1=pending, 2=completed, 3=failed, 4/5=cancelled
    const statusTypeID = result?.statusTypeID || result?.status || 1;
    const status = this.mapBillStatus(statusTypeID);

    return {
      id: result?.reference || id,
      checkoutUrl: '', // Not available from status endpoint
      status,
      amount: parseFloat(result?.amount || '0'),
      currency: 'ZAR',
      reference: result?.userReference || id,
      provider: 'softycomp',
      createdAt: result?.createdDate || new Date().toISOString(),
      raw: result,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundData: any = {
      Reference: params.paymentId,
      UserReference: params.paymentId,
    };

    if (params.amount !== undefined) {
      refundData.Amount = parseFloat(params.amount.toFixed(2));
    }

    const result = await this.apiRequest<any>(
      'POST',
      '/api/paygatecontroller/requestCreditTransaction',
      refundData
    );

    return {
      id: result?.reference || `refund_${params.paymentId}_${Date.now()}`,
      status: result?.success ? 'completed' : 'pending',
      amount: params.amount || 0,
      currency: 'ZAR',
      paymentId: params.paymentId,
      createdAt: new Date().toISOString(),
      raw: result,
    };
  }

  // ==================== Webhooks ====================

  parseWebhook(body: any, _headers?: any): WebhookEvent {
    const event = typeof body === 'string' ? JSON.parse(body) : body;

    // Handle both field names: activityTypeID (docs) and WebhookTypeID (observed)
    // Mapping: 1=Pending, 2=Successful, 3=Failed, 4=Cancelled
    const typeId = event.activityTypeID || event.WebhookTypeID || 1;
    let eventType: 'payment.pending' | 'payment.completed' | 'payment.failed' | 'payment.cancelled' = 'payment.pending';
    let status: PaymentStatus = 'pending';

    switch (typeId) {
      case 2:
        eventType = 'payment.completed';
        status = 'completed';
        break;
      case 3:
        eventType = 'payment.failed';
        status = 'failed';
        break;
      case 4:
        eventType = 'payment.cancelled';
        status = 'cancelled';
        break;
      default:
        eventType = 'payment.pending';
        status = 'pending';
    }

    return {
      type: eventType,
      payment: {
        id: event.reference,
        checkoutUrl: '',
        status,
        amount: event.amount,
        currency: 'ZAR',
        reference: event.userReference,
        provider: 'softycomp',
        createdAt: event.transactionDate,
      },
      raw: event,
    };
  }

  verifyWebhook(body: string | Buffer, headers?: any): boolean {
    const signature = headers?.signature || headers?.['x-signature'];

    if (!signature || !this.webhookSecret) {
      // No signature validation configured
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
  }

  // ==================== Helpers ====================

  private mapBillStatus(statusTypeID: number | string): PaymentStatus {
    switch (Number(statusTypeID)) {
      case 1: return 'pending';   // New
      case 2: return 'completed'; // Paid
      case 3: return 'failed';    // Failed
      case 4: return 'cancelled'; // Expired
      case 5: return 'cancelled'; // Cancelled
      default: return 'pending';
    }
  }
}
