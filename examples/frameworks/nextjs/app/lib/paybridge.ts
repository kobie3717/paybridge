import { PayBridge, PayBridgeRouter, InMemoryIdempotencyStore } from 'paybridge';

const stripe = new PayBridge({
  provider: 'stripe',
  credentials: { apiKey: process.env.STRIPE_API_KEY! },
  sandbox: process.env.NODE_ENV !== 'production',
});

const paystack = new PayBridge({
  provider: 'paystack',
  credentials: { apiKey: process.env.PAYSTACK_API_KEY! },
  sandbox: process.env.NODE_ENV !== 'production',
});

export const router = new PayBridgeRouter({
  providers: [{ provider: stripe }, { provider: paystack }],
  strategy: 'cheapest',
  idempotencyStore: new InMemoryIdempotencyStore(),
});
