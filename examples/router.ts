/**
 * Example: Multi-provider routing with fallback
 */

import { PayBridge, PayBridgeRouter } from '../src';

async function main() {
  const softycomp = new PayBridge({
    provider: 'softycomp',
    credentials: {
      apiKey: process.env.SOFTYCOMP_API_KEY || '',
      secretKey: process.env.SOFTYCOMP_SECRET_KEY || '',
    },
    sandbox: true,
  });

  const yoco = new PayBridge({
    provider: 'yoco',
    credentials: {
      apiKey: process.env.YOCO_API_KEY || '',
    },
    sandbox: true,
  });

  const ozow = new PayBridge({
    provider: 'ozow',
    credentials: {
      apiKey: process.env.OZOW_API_KEY || '',
      siteCode: process.env.OZOW_SITE_CODE || '',
      privateKey: process.env.OZOW_PRIVATE_KEY || '',
    },
    sandbox: true,
  });

  const router = new PayBridgeRouter({
    providers: [
      { provider: ozow, priority: 1 },
      { provider: yoco, priority: 2 },
      { provider: softycomp, priority: 3 },
    ],
    strategy: 'cheapest',
    fallback: {
      enabled: true,
      maxAttempts: 3,
      retryDelayMs: 250,
    },
  });

  try {
    const payment = await router.createPayment({
      amount: 299.0,
      currency: 'ZAR',
      reference: 'INV-ROUTER-001',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '0825551234',
      },
      urls: {
        success: 'https://myapp.com/success',
        cancel: 'https://myapp.com/cancel',
        webhook: 'https://myapp.com/webhook',
      },
    });

    console.log('Payment created:', payment.id);
    console.log('Checkout URL:', payment.checkoutUrl);
    console.log('Routing metadata:', payment.routingMeta);
  } catch (error: any) {
    if (error.name === 'RoutingError') {
      console.error('All providers failed:');
      console.error('Attempts:', error.attempts);
    } else {
      console.error('Error:', error.message);
    }
  }
}

main().catch(console.error);
