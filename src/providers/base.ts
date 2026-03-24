/**
 * Base payment provider abstract class
 * All payment providers must extend this class
 */

import {
  CreatePaymentParams,
  PaymentResult,
  CreateSubscriptionParams,
  SubscriptionResult,
  RefundParams,
  RefundResult,
  WebhookEvent,
} from '../types';

export abstract class PaymentProvider {
  /**
   * Provider name (e.g. 'softycomp', 'yoco', 'ozow')
   */
  abstract readonly name: string;

  /**
   * Supported currencies
   */
  abstract readonly supportedCurrencies: string[];

  /**
   * Create a one-time payment
   */
  abstract createPayment(params: CreatePaymentParams): Promise<PaymentResult>;

  /**
   * Create a recurring subscription
   */
  abstract createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult>;

  /**
   * Get payment status
   */
  abstract getPayment(id: string): Promise<PaymentResult>;

  /**
   * Process a refund (full or partial)
   */
  abstract refund(params: RefundParams): Promise<RefundResult>;

  /**
   * Parse webhook payload into unified event format
   */
  abstract parseWebhook(body: any, headers?: any): WebhookEvent;

  /**
   * Verify webhook signature
   * @returns true if signature is valid, false otherwise
   */
  abstract verifyWebhook(body: any, headers?: any): boolean;

  /**
   * Validate currency is supported
   */
  protected validateCurrency(currency: string): void {
    if (!this.supportedCurrencies.includes(currency)) {
      throw new Error(
        `Currency ${currency} not supported by ${this.name}. Supported: ${this.supportedCurrencies.join(', ')}`
      );
    }
  }

  /**
   * Validate future date
   */
  protected validateFutureDate(dateStr: string, fieldName: string): void {
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (date <= now) {
      throw new Error(`${fieldName} must be a future date (minimum tomorrow)`);
    }
  }
}
