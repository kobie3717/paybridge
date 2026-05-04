import Fastify from 'fastify';
import { PayBridge, PayBridgeRouter, InMemoryIdempotencyStore, WebhookDuplicateError } from 'paybridge';

const stripe = new PayBridge({
  provider: 'stripe',
  credentials: { apiKey: process.env.STRIPE_API_KEY ?? 'sk_test_dummy' },
  sandbox: true,
});

const paystack = new PayBridge({
  provider: 'paystack',
  credentials: { apiKey: process.env.PAYSTACK_API_KEY ?? 'sk_test_dummy' },
  sandbox: true,
});

const router = new PayBridgeRouter({
  providers: [
    { provider: stripe, priority: 1 },
    { provider: paystack, priority: 2 },
  ],
  strategy: 'cheapest',
  fallback: { enabled: true, maxAttempts: 2 },
  idempotencyStore: new InMemoryIdempotencyStore(),
});

const fastify = Fastify({ logger: true });

fastify.post('/checkout', async (request, reply) => {
  const { amount, currency, reference, customer } = request.body as any;
  try {
    const result = await router.createPayment({
      amount,
      currency,
      reference,
      customer,
      urls: {
        success: `${request.protocol}://${request.hostname}/success`,
        cancel: `${request.protocol}://${request.hostname}/cancel`,
        webhook: `${request.protocol}://${request.hostname}/webhook/${result.provider}`,
      },
    });
    return { checkoutUrl: result.checkoutUrl, id: result.id, provider: result.provider };
  } catch (err: any) {
    reply.status(500);
    return { error: err.message };
  }
});

// Custom raw-body parser for webhook routes
fastify.post(
  '/webhook/:provider',
  {
    config: {
      rawBody: true,
    },
  },
  async (request, reply) => {
    const provider = request.params as { provider: string };
    const rawBody = await request.raw.read();
    const headers = request.headers;

    const valid = router.verifyWebhook(rawBody, headers, provider.provider as any);
    if (!valid) {
      reply.status(401);
      return 'Invalid signature';
    }

    try {
      const event = await router.parseWebhook(rawBody, headers, provider.provider as any);
      fastify.log.info({ provider: provider.provider, type: event.type, id: event.payment?.id }, 'webhook');
      return 'ok';
    } catch (err) {
      if (err instanceof WebhookDuplicateError) return 'ok';
      throw err;
    }
  }
);

const port = Number(process.env.PORT ?? 3000);

fastify.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
