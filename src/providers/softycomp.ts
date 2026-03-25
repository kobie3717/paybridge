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

  // ==================== Bill Management ====================

  /**
   * Set a bill to expired status
   */
  async setBillToExpiredStatus(reference: string, userReference: string): Promise<void> {
    await this.apiRequest(
      'POST',
      `/api/paygatecontroller/setBillToExpiredStatus/${encodeURIComponent(reference)}/${encodeURIComponent(userReference)}`,
      '' // Empty body required
    );
  }

  /**
   * Update bill presentment details
   */
  async updateBillPresentment(params: {
    reference: string;
    amount?: number;
    description?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  }): Promise<void> {
    // First, get the current bill to retrieve full structure
    const currentBill = await this.apiRequest<any>(
      'GET',
      `/api/paygatecontroller/listBillPresentmentDetails/${params.reference}/${params.reference}`
    );

    const updateData: any = {
      Reference: params.reference,
      UserReference: currentBill.userReference || params.reference,
      Items: currentBill.items || [],
    };

    if (params.customerName !== undefined) {
      updateData.Name = params.customerName;
    }
    if (params.customerEmail !== undefined) {
      updateData.Emailaddress = params.customerEmail;
    }
    if (params.customerPhone !== undefined) {
      updateData.Cellno = params.customerPhone;
    }

    // Update item fields if amount or description changed
    if (updateData.Items.length > 0) {
      if (params.amount !== undefined) {
        updateData.Items[0].Amount = parseFloat(params.amount.toFixed(2));
      }
      if (params.description !== undefined) {
        updateData.Items[0].Description = params.description;
      }
    }

    await this.apiRequest(
      'POST',
      '/api/paygatecontroller/updateBillPresentment',
      updateData
    );
  }

  /**
   * List bill presentment audit trail
   */
  async listBillPresentmentAudits(reference: string, userReference: string): Promise<Array<{
    auditId: number;
    timestamp: string;
    description: string;
    user: string;
    raw: any;
  }>> {
    const result = await this.apiRequest<any[]>(
      'GET',
      `/api/paygatecontroller/listBillPresentmentAudits/${encodeURIComponent(reference)}/${encodeURIComponent(userReference)}`
    );

    return (result || []).map((audit: any) => ({
      auditId: audit.auditId || 0,
      timestamp: audit.timestamp || audit.date || '',
      description: audit.description || audit.action || '',
      user: audit.user || audit.userName || '',
      raw: audit,
    }));
  }

  // ==================== Client Management ====================

  /**
   * Create a new client
   */
  async createClient(params: {
    name: string;
    surname: string;
    email: string;
    phone: string;
    idNumber?: string;
  }): Promise<number> {
    const result = await this.apiRequest<{
      value: number;
      success: boolean;
      messages: string[];
    }>(
      'POST',
      '/api/clients/createclient',
      {
        clientId: 0,
        clientTypeId: 1, // Individual
        contractCode: `C${Date.now().toString().slice(-13)}`, // Max 14 chars
        initials: params.name.charAt(0),
        surname: params.surname,
        idnumber: params.idNumber || '',
        clientStatusTypeId: 1, // Active
        cellphoneNumber: params.phone,
        emailAddress: params.email,
        sendSmsDonotifications: true,
        sendSmsUnpaidsNotifications: true,
        isSouthAfricanCitizen: true,
        fullNames: params.name,
      }
    );

    if (!result.success) {
      throw new Error(`SoftyComp create client failed: ${result.messages.join(', ')}`);
    }
    return result.value;
  }

  // ==================== Mobi-Mandate (Debit Orders) ====================

  /**
   * Create a Mobi-Mandate request for debit order sign-up
   */
  async createMobiMandate(params: {
    customerEmail: string;
    customerPhone: string;
    surname: string;
    initials?: string;
    idNumber?: string;
    amount: number;
    frequency: 'monthly' | 'yearly';
    debitDay?: number;
    description?: string;
    contractCode?: string;
    initialAmount?: number;
    accountName?: string;
    accountNumber?: string;
    branchCode?: string;
    accountType?: number;
    expiryDate?: string;
    commencementDate?: string;
    collectionMethodTypeId?: number;
    productId?: string;
    maxCollectionAmount?: number;
    successUrl?: string;
    callbackUrl?: string;
  }): Promise<{
    url: string;
    success: boolean;
    message: string;
  }> {
    const frequencyMap: Record<string, number> = {
      monthly: 2,
      yearly: 4,
    };

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultCommencementDate = tomorrow.toISOString().split('T')[0];

    const mandateData = {
      EmailAddress: params.customerEmail,
      CellphoneNumber: params.customerPhone,
      ContractCode: params.contractCode || `M${Date.now().toString().slice(-5)}`, // Max 6 chars
      Surname: params.surname,
      Initials: params.initials || params.surname.charAt(0),
      IDNumber: params.idNumber || '',
      ProductID: params.productId ? parseInt(params.productId, 10) : null,
      Amount: parseFloat(params.amount.toFixed(2)),
      InitialAmount: params.initialAmount ? parseFloat(params.initialAmount.toFixed(2)) : parseFloat(params.amount.toFixed(2)),
      AccountName: params.accountName || '',
      AccountNumber: params.accountNumber || '',
      BranchCode: params.branchCode || '',
      AccountType: params.accountType || 1,
      ExpiryDate: params.expiryDate || null,
      CommencementDate: params.commencementDate || defaultCommencementDate,
      CollectionFrequencyTypeID: frequencyMap[params.frequency] || 2,
      CollectionMethodTypeID: params.collectionMethodTypeId || 4, // NAEDO
      DebitDay: params.debitDay || 1,
      Description: params.description || 'Debit Order',
      DebitMonth: null,
      TransactionDate1: null,
      TransactionDate2: null,
      TransactionDate3: null,
      TransactionDate4: null,
      NaedoTrackingCodeID: 12,
      EntryClassCodeTypeID: 1,
      AdjustmentCategoryTypeID: 2,
      DebiCheckMaximumCollectionAmount: params.maxCollectionAmount || (params.amount * 1.5),
      DateAdjustmentAllowed: false,
      AdjustmentAmount: 0,
      AdjustmentRate: 0,
      DebitValueTypeID: 1,
      RedirectURL: params.successUrl || '',
      CallbackURL: params.callbackUrl || '',
      SendCorrespondence: true,
      ExternalRequest: true,
      HideHomeTel: true,
      HideWorkTel: true,
      HideProductDetail: false,
      HideExpiryDate: true,
      HideAdditionalInfo: true,
      HideDescription: false,
    };

    const result = await this.apiRequest<{
      success: boolean;
      tinyURL: string;
      message: string;
    }>(
      'POST',
      '/api/mobimandate/generateMobiMandateRequest',
      mandateData
    );

    if (!result.success) {
      throw new Error(`SoftyComp Mobi-Mandate failed: ${result.message}`);
    }

    return {
      url: result.tinyURL,
      success: result.success,
      message: result.message,
    };
  }

  /**
   * Update collection status (e.g., cancel a debit order)
   */
  async updateCollectionStatus(params: {
    collectionId: number;
    statusTypeId: number;
  }): Promise<void> {
    await this.apiRequest(
      'POST',
      '/api/collections/updateCollectionStatus',
      {
        collectionID: params.collectionId,
        collectionStatusTypeID: params.statusTypeId,
      }
    );
  }

  // ==================== Credit Distribution (Payouts) ====================

  /**
   * Create a credit distribution (payout to bank account)
   */
  async createCreditDistribution(params: {
    amount: number;
    accountNumber: string;
    branchCode: string;
    accountName: string;
    reference: string;
    userReference?: string;
  }): Promise<{
    distributionId: string;
    success: boolean;
    messages: string[];
  }> {
    const result = await this.apiRequest<{
      value?: any;
      success: boolean;
      messages: string[];
    }>(
      'POST',
      '/api/creditdistribution/createCreditDistribution',
      {
        creditFileTransactions: [
          {
            amount: parseFloat(params.amount.toFixed(2)),
            accountNumber: params.accountNumber,
            branchCode: params.branchCode,
            accountName: params.accountName,
            reference: params.reference,
            userReference: params.userReference || params.reference,
          },
        ],
      }
    );

    return {
      distributionId: result?.value?.toString() || `dist_${Date.now()}`,
      success: result?.success || false,
      messages: result?.messages || [],
    };
  }

  // ==================== Re-authentication ====================

  /**
   * Handle card expiry / re-auth: expire old bill and create new one
   */
  async createReauthBill(params: {
    oldReference: string;
    newReference: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    description: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    successUrl: string;
    cancelUrl: string;
    notifyUrl: string;
  }): Promise<SubscriptionResult> {
    // Step 1: Expire the old bill
    try {
      await this.setBillToExpiredStatus(params.oldReference, params.oldReference);
    } catch (err) {
      console.warn(`[SoftyComp] Could not expire old bill ${params.oldReference}:`, err);
      // Continue — the old bill may already be expired
    }

    // Step 2: Create a new subscription with a different reference
    const isMonthly = params.billingCycle === 'MONTHLY';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.createSubscription({
      amount: params.amount,
      currency: 'ZAR',
      interval: isMonthly ? 'monthly' : 'yearly',
      reference: params.newReference,
      description: params.description,
      customer: {
        name: params.customerName,
        email: params.customerEmail,
        phone: params.customerPhone,
      },
      urls: {
        success: params.successUrl,
        cancel: params.cancelUrl,
        webhook: params.notifyUrl,
      },
      startDate: tomorrow.toISOString().split('T')[0],
      billingDay: tomorrow.getDate(),
    });
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
