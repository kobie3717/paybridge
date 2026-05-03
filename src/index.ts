/**
 * PayBridge — Unified payment SDK for Node.js
 * One API. Every payment provider.
 *
 * @see https://github.com/kobie3717/paybridge
 */

import { PaymentProvider } from './providers/base';
import { SoftyCompProvider } from './providers/softycomp';
import { YocoProvider } from './providers/yoco';
import { OzowProvider } from './providers/ozow';
import { PeachProvider } from './providers/peach';
import { StripeProvider } from './providers/stripe';
import { PayFastProvider } from './providers/payfast';
import { PayStackProvider } from './providers/paystack';
import { FlutterwaveProvider } from './providers/flutterwave';

import {
  PayBridgeConfig,
  Provider,
  CreatePaymentParams,
  PaymentResult,
  CreateSubscriptionParams,
  SubscriptionResult,
  RefundParams,
  RefundResult,
  WebhookEvent,
} from './types';

export * from './types';
export * from './utils/currency';
export * from './utils/fetch';
export * from './routing-types';
export * from './circuit-breaker';
export * from './circuit-breaker-store';
export * from './strategies';
export * from './router';
export * from './crypto';
export * from './webhook-idempotency-store';
export { createRedisCircuitBreakerStore, type RedisLike, type RedisStoreOptions } from './stores/redis';
export { createRedisIdempotencyStore, type RedisIdempotencyStoreOptions } from './stores/redis-idempotency';

export class PayBridge {
  public readonly provider: PaymentProvider;

  constructor(config: PayBridgeConfig) {
    this.provider = this.createProvider(config);
  }

  /**
   * Create provider instance based on config
   */
  private createProvider(config: PayBridgeConfig): PaymentProvider {
    const { provider, credentials, sandbox = true, webhookSecret } = config;

    switch (provider) {
      case 'softycomp':
        if (!credentials.apiKey || !credentials.secretKey) {
          throw new Error('SoftyComp requires apiKey and secretKey');
        }
        return new SoftyCompProvider({
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          sandbox,
          webhookSecret,
        });

      case 'yoco':
        if (!credentials.apiKey) {
          throw new Error('Yoco requires apiKey (secret key)');
        }
        return new YocoProvider({
          apiKey: credentials.apiKey,
          sandbox,
          webhookSecret,
        });

      case 'ozow':
        if (!credentials.apiKey || !credentials.siteCode || !credentials.privateKey) {
          throw new Error('Ozow requires apiKey, siteCode, and privateKey');
        }
        return new OzowProvider({
          apiKey: credentials.apiKey,
          siteCode: credentials.siteCode,
          privateKey: credentials.privateKey,
          sandbox,
        });

      case 'stripe':
        if (!credentials.apiKey) {
          throw new Error('Stripe requires apiKey (secret key, sk_test_* or sk_live_*)');
        }
        return new StripeProvider({
          apiKey: credentials.apiKey,
          webhookSecret,
          sandbox,
        });

      case 'payfast':
        if (!credentials.merchantId || !credentials.merchantKey) {
          throw new Error('PayFast requires merchantId and merchantKey');
        }
        return new PayFastProvider({
          merchantId: credentials.merchantId,
          merchantKey: credentials.merchantKey,
          passphrase: credentials.passphrase,
          sandbox,
          webhookSecret,
        });

      case 'paystack':
        if (!credentials.apiKey) {
          throw new Error('PayStack requires apiKey (secret key, sk_test_* or sk_live_*)');
        }
        return new PayStackProvider({
          apiKey: credentials.apiKey,
          sandbox,
          webhookSecret,
        });

      case 'peach':
        if (!credentials.apiKey || !credentials.secretKey) {
          throw new Error('Peach Payments requires apiKey (access token) and secretKey (entityId)');
        }
        return new PeachProvider({
          accessToken: credentials.apiKey,
          entityId: credentials.secretKey,
          sandbox,
          webhookSecret,
        });

      case 'flutterwave':
        if (!credentials.apiKey) {
          throw new Error('Flutterwave requires apiKey (FLWSECK_TEST-* or FLWSECK-*)');
        }
        return new FlutterwaveProvider({
          apiKey: credentials.apiKey,
          sandbox,
          webhookSecret,
        });
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // ==================== Payment Methods ====================

  /**
   * Create a one-time payment
   *
   * @example
   * ```typescript
   * const payment = await pay.createPayment({
   *   amount: 299.00,
   *   currency: 'ZAR',
   *   reference: 'INV-001',
   *   customer: {
   *     name: 'John Doe',
   *     email: 'john@example.com',
   *     phone: '0825551234'
   *   },
   *   urls: {
   *     success: 'https://myapp.com/success',
   *     cancel: 'https://myapp.com/cancel',
   *     webhook: 'https://myapp.com/webhook'
   *   }
   * });
   *
   * // Redirect customer to payment page
   * res.redirect(payment.checkoutUrl);
   * ```
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    return this.provider.createPayment(params);
  }

  /**
   * Create a recurring subscription
   *
   * @example
   * ```typescript
   * const subscription = await pay.createSubscription({
   *   amount: 299.00,
   *   currency: 'ZAR',
   *   interval: 'monthly',
   *   reference: 'SUB-001',
   *   customer: {
   *     name: 'John Doe',
   *     email: 'john@example.com'
   *   },
   *   urls: {
   *     success: 'https://myapp.com/success',
   *     cancel: 'https://myapp.com/cancel',
   *     webhook: 'https://myapp.com/webhook'
   *   },
   *   startDate: '2026-04-01'
   * });
   * ```
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    return this.provider.createSubscription(params);
  }

  /**
   * Get payment status
   *
   * @example
   * ```typescript
   * const payment = await pay.getPayment('pay_123');
   * if (payment.status === 'completed') {
   *   console.log('Payment received!');
   * }
   * ```
   */
  async getPayment(id: string): Promise<PaymentResult> {
    return this.provider.getPayment(id);
  }

  /**
   * Process a refund (full or partial)
   *
   * @example
   * ```typescript
   * // Full refund
   * const refund = await pay.refund({
   *   paymentId: 'pay_123'
   * });
   *
   * // Partial refund
   * const refund = await pay.refund({
   *   paymentId: 'pay_123',
   *   amount: 100.00,
   *   reason: 'Customer request'
   * });
   * ```
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    return this.provider.refund(params);
  }

  // ==================== Webhooks ====================

  /**
   * Parse webhook payload into unified event format
   *
   * @example
   * ```typescript
   * app.post('/webhook', express.json(), (req, res) => {
   *   const event = pay.parseWebhook(req.body, req.headers);
   *
   *   switch (event.type) {
   *     case 'payment.completed':
   *       console.log('Payment completed:', event.payment);
   *       break;
   *     case 'payment.failed':
   *       console.log('Payment failed:', event.payment);
   *       break;
   *   }
   *
   *   res.sendStatus(200);
   * });
   * ```
   */
  parseWebhook(body: any, headers?: any): WebhookEvent {
    return this.provider.parseWebhook(body, headers);
  }

  /**
   * Verify webhook signature
   *
   * @example
   * ```typescript
   * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
   *   if (!pay.verifyWebhook(req.body, req.headers)) {
   *     return res.status(400).send('Invalid signature');
   *   }
   *
   *   const event = pay.parseWebhook(req.body, req.headers);
   *   // Process event...
   *
   *   res.sendStatus(200);
   * });
   * ```
   */
  verifyWebhook(body: any, headers?: any): boolean {
    return this.provider.verifyWebhook(body, headers);
  }

  // ==================== Helpers ====================

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Get supported currencies for current provider
   */
  getSupportedCurrencies(): string[] {
    return this.provider.supportedCurrencies;
  }
}

export default PayBridge;
