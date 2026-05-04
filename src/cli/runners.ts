import { PayBridge } from '../index';
import { CryptoRamp } from '../crypto';

export interface ProviderRunner {
  name: string;
  envRequired: string[];
  run: () => Promise<{ id: string; checkoutUrl?: string; status: string }>;
}

const timestamp = Date.now();
const testCustomer = {
  name: 'Test User',
  email: 'test@example.com',
  phone: '0825551234',
};
const testUrls = {
  success: 'https://example.com/success',
  cancel: 'https://example.com/cancel',
  webhook: 'https://example.com/webhook',
};

export const runners: ProviderRunner[] = [
  {
    name: 'softycomp',
    envRequired: ['SOFTYCOMP_API_KEY', 'SOFTYCOMP_SECRET_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'softycomp',
        credentials: {
          apiKey: process.env.SOFTYCOMP_API_KEY!,
          secretKey: process.env.SOFTYCOMP_SECRET_KEY!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'ZAR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'yoco',
    envRequired: ['YOCO_API_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'yoco',
        credentials: { apiKey: process.env.YOCO_API_KEY! },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'ZAR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'ozow',
    envRequired: ['OZOW_API_KEY', 'OZOW_SITE_CODE', 'OZOW_PRIVATE_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'ozow',
        credentials: {
          apiKey: process.env.OZOW_API_KEY!,
          siteCode: process.env.OZOW_SITE_CODE!,
          privateKey: process.env.OZOW_PRIVATE_KEY!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'ZAR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl!, status: payment.status };
    },
  },
  {
    name: 'payfast',
    envRequired: ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'payfast',
        credentials: {
          merchantId: process.env.PAYFAST_MERCHANT_ID!,
          merchantKey: process.env.PAYFAST_MERCHANT_KEY!,
          passphrase: process.env.PAYFAST_PASSPHRASE,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'ZAR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl!, status: payment.status };
    },
  },
  {
    name: 'paystack',
    envRequired: ['PAYSTACK_API_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'paystack',
        credentials: { apiKey: process.env.PAYSTACK_API_KEY! },
        sandbox: true,
      });
      const currencies = (process.env.PAYSTACK_TEST_CURRENCY || 'NGN,ZAR,GHS,KES').split(',');
      let lastErr: Error | undefined;
      for (const currency of currencies) {
        try {
          const payment = await pay.createPayment({
            amount: 100.0,
            currency: currency.trim() as any,
            reference: `cli-test-${timestamp}-${currency.trim()}`,
            customer: testCustomer,
            urls: testUrls,
          });
          return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
        } catch (e: any) {
          lastErr = e;
          if (!/currency not supported/i.test(e.message)) throw e;
        }
      }
      throw lastErr ?? new Error('No currency accepted by PayStack merchant');
    },
  },
  {
    name: 'stripe',
    envRequired: ['STRIPE_API_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'stripe',
        credentials: { apiKey: process.env.STRIPE_API_KEY! },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'USD',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'peach',
    envRequired: ['PEACH_ACCESS_TOKEN', 'PEACH_ENTITY_ID'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'peach',
        credentials: {
          apiKey: process.env.PEACH_ACCESS_TOKEN!,
          secretKey: process.env.PEACH_ENTITY_ID!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'ZAR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl!, status: payment.status };
    },
  },
  {
    name: 'flutterwave',
    envRequired: ['FLUTTERWAVE_API_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'flutterwave',
        credentials: { apiKey: process.env.FLUTTERWAVE_API_KEY! },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'NGN',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'adyen',
    envRequired: ['ADYEN_API_KEY', 'ADYEN_MERCHANT_ACCOUNT'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'adyen',
        credentials: {
          apiKey: process.env.ADYEN_API_KEY!,
          merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'EUR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'mercadopago',
    envRequired: ['MERCADOPAGO_ACCESS_TOKEN'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'mercadopago',
        credentials: { apiKey: process.env.MERCADOPAGO_ACCESS_TOKEN! },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'BRL',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'razorpay',
    envRequired: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'razorpay',
        credentials: {
          apiKey: process.env.RAZORPAY_KEY_ID!,
          secretKey: process.env.RAZORPAY_KEY_SECRET!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'INR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'mollie',
    envRequired: ['MOLLIE_API_KEY'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'mollie',
        credentials: { apiKey: process.env.MOLLIE_API_KEY! },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'EUR',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'square',
    envRequired: ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'square',
        credentials: {
          apiKey: process.env.SQUARE_ACCESS_TOKEN!,
          locationId: process.env.SQUARE_LOCATION_ID!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'USD',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'pesapal',
    envRequired: ['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET'],
    run: async () => {
      const pay = new PayBridge({
        provider: 'pesapal',
        credentials: {
          apiKey: process.env.PESAPAL_CONSUMER_KEY!,
          secretKey: process.env.PESAPAL_CONSUMER_SECRET!,
        },
        sandbox: true,
      });
      const payment = await pay.createPayment({
        amount: 1.0,
        currency: 'KES',
        reference: `cli-test-${timestamp}`,
        customer: testCustomer,
        urls: testUrls,
      });
      return { id: payment.id, checkoutUrl: payment.checkoutUrl, status: payment.status };
    },
  },
  {
    name: 'moonpay',
    envRequired: ['MOONPAY_API_KEY', 'MOONPAY_SECRET_KEY'],
    run: async () => {
      const ramp = new CryptoRamp({
        provider: 'moonpay',
        credentials: {
          apiKey: process.env.MOONPAY_API_KEY!,
          secretKey: process.env.MOONPAY_SECRET_KEY!,
        },
        sandbox: true,
      });
      const result = await ramp.createOnRamp({
        fiatAmount: 1.0,
        fiatCurrency: 'USD',
        asset: 'BTC',
        network: 'BTC',
        destinationWallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        customer: testCustomer,
        urls: testUrls,
        reference: `cli-test-${timestamp}`,
      });
      return { id: result.id, checkoutUrl: result.checkoutUrl, status: result.status };
    },
  },
];
