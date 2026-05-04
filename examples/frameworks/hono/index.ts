import { Hono } from 'hono';
import { serve } from '@hono/node-server';
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
  providers: [{ provider: stripe }, { provider: paystack }],
  strategy: 'cheapest',
  idempotencyStore: new InMemoryIdempotencyStore(),
});

const app = new Hono();

app.post('/checkout', async (c) => {
  const body = await c.req.json();
  const result = await router.createPayment({
    amount: body.amount,
    currency: body.currency,
    reference: body.reference,
    customer: body.customer,
    urls: {
      success: `${new URL(c.req.url).origin}/success`,
      cancel: `${new URL(c.req.url).origin}/cancel`,
      webhook: `${new URL(c.req.url).origin}/webhook/${result.provider}`,
    },
  });
  return c.json({ checkoutUrl: result.checkoutUrl, id: result.id });
});

app.post('/webhook/:provider', async (c) => {
  const provider = c.req.param('provider') as any;
  const rawBody = await c.req.text();
  const headers = Object.fromEntries(c.req.raw.headers);

  if (!router.verifyWebhook(rawBody, headers, provider)) {
    return c.text('Invalid signature', 401);
  }

  try {
    const event = await router.parseWebhook(rawBody, headers, provider);
    console.log(`[webhook] ${provider} ${event.type}`);
    return c.text('ok');
  } catch (err) {
    if (err instanceof WebhookDuplicateError) return c.text('ok');
    throw err;
  }
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
