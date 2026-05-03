/**
 * PayBridge — Unified payment SDK types
 */

// ==================== Provider Types ====================

export type Provider = 'softycomp' | 'yoco' | 'ozow' | 'payfast' | 'paystack' | 'stripe' | 'peach' | 'flutterwave';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export type SubscriptionInterval = 'weekly' | 'monthly' | 'yearly';

export type Currency = 'ZAR' | 'USD' | 'EUR' | 'GBP' | 'NGN' | 'KES' | 'UGX' | 'GHS' | string;

export type WebhookEventType =
  | 'payment.pending'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'subscription.created'
  | 'subscription.cancelled'
  | 'refund.completed';

// ==================== Configuration ====================

export interface PayBridgeConfig {
  /** Payment provider to use */
  provider: Provider;
  /** Provider-specific credentials */
  credentials: {
    /** API key or merchant ID */
    apiKey?: string;
    /** Secret key or merchant key */
    secretKey?: string;
    /** Additional provider-specific credentials */
    [key: string]: any;
  };
  /** Use sandbox/test environment */
  sandbox?: boolean;
  /** Optional webhook secret for signature validation */
  webhookSecret?: string;
}

// ==================== Customer ====================

export interface Customer {
  /** Customer full name */
  name: string;
  /** Customer email address */
  email: string;
  /** Customer phone number (e.g. "0825551234" or "+27825551234") */
  phone?: string;
  /** Customer ID in your system */
  customerId?: string;
}

// ==================== Payment ====================

export interface CreatePaymentParams {
  /** Amount in major currency unit (e.g. 299.00 for R299) */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: Currency;
  /** Your internal reference/invoice number */
  reference: string;
  /** Payment description */
  description?: string;
  /** Customer details */
  customer: Customer;
  /** Redirect URLs */
  urls: {
    /** URL to redirect customer after successful payment */
    success: string;
    /** URL to redirect customer after cancelled payment */
    cancel: string;
    /** URL to receive webhook notifications */
    webhook: string;
  };
  /** Additional metadata (up to 10 key-value pairs) */
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  /** Unique payment ID from provider */
  id: string;
  /** Payment checkout URL (redirect customer here) */
  checkoutUrl: string;
  /** Payment status */
  status: PaymentStatus;
  /** Amount in major currency unit */
  amount: number;
  /** Currency code */
  currency: Currency;
  /** Your reference */
  reference: string;
  /** Provider name */
  provider: Provider;
  /** ISO 8601 timestamp when payment was created */
  createdAt: string;
  /** ISO 8601 timestamp when checkout URL expires (if applicable) */
  expiresAt?: string;
  /** Raw provider response */
  raw?: any;
  /** Routing metadata (populated by PayBridgeRouter) */
  routingMeta?: import('./routing-types').RoutingMeta;
}

// ==================== Subscription ====================

export interface CreateSubscriptionParams {
  /** Amount in major currency unit (e.g. 299.00 for R299) */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: Currency;
  /** Billing interval */
  interval: SubscriptionInterval;
  /** Your internal subscription reference */
  reference: string;
  /** Subscription description */
  description?: string;
  /** Customer details */
  customer: Customer;
  /** Redirect URLs */
  urls: {
    /** URL to redirect customer after successful setup */
    success: string;
    /** URL to redirect customer after cancelled setup */
    cancel: string;
    /** URL to receive webhook notifications */
    webhook: string;
  };
  /** Subscription start date (ISO 8601). Must be future date. */
  startDate?: string;
  /** Day of month to charge (1-28). Only for monthly subscriptions. */
  billingDay?: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface SubscriptionResult {
  /** Unique subscription ID from provider */
  id: string;
  /** Subscription setup URL (redirect customer here) */
  checkoutUrl: string;
  /** Subscription status */
  status: 'pending' | 'active' | 'cancelled' | 'expired';
  /** Amount in major currency unit */
  amount: number;
  /** Currency code */
  currency: Currency;
  /** Billing interval */
  interval: SubscriptionInterval;
  /** Your reference */
  reference: string;
  /** Provider name */
  provider: Provider;
  /** ISO 8601 timestamp when subscription starts */
  startsAt?: string;
  /** ISO 8601 timestamp when subscription was created */
  createdAt: string;
  /** Raw provider response */
  raw?: any;
}

// ==================== Refund ====================

export interface RefundParams {
  /** Original payment ID to refund */
  paymentId: string;
  /** Amount to refund in major currency unit. Omit for full refund. */
  amount?: number;
  /** Reason for refund */
  reason?: string;
}

export interface RefundResult {
  /** Refund ID */
  id: string;
  /** Refund status */
  status: 'pending' | 'completed' | 'failed';
  /** Amount refunded in major currency unit */
  amount: number;
  /** Currency code */
  currency: Currency;
  /** Original payment ID */
  paymentId: string;
  /** ISO 8601 timestamp when refund was created */
  createdAt: string;
  /** Raw provider response */
  raw?: any;
}

// ==================== Webhooks ====================

export interface WebhookEvent {
  /** Event type */
  type: WebhookEventType;
  /** Payment or subscription details */
  payment?: PaymentResult;
  subscription?: SubscriptionResult;
  refund?: RefundResult;
  /** Raw provider payload */
  raw: any;
}
