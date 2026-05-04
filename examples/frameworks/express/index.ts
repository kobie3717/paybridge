import express from 'express';
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

const app = express();

app.use(express.json());

app.post('/checkout', async (req, res) => {
  const { amount, currency, reference, customer } = req.body;
  try {
    const result = await router.createPayment({
      amount,
      currency,
      reference,
      customer,
      urls: {
        success: `${req.protocol}://${req.get('host')}/success`,
        cancel: `${req.protocol}://${req.get('host')}/cancel`,
        webhook: `${req.protocol}://${req.get('host')}/webhook/${result.provider}`,
      },
    });
    res.json({ checkoutUrl: result.checkoutUrl, id: result.id, provider: result.provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Raw body required for signature verification
app.post('/webhook/:provider', express.raw({ type: '*/*' }), async (req, res) => {
  const provider = req.params.provider as any;
  const valid = router.verifyWebhook(req.body, req.headers, provider);
  if (!valid) return res.status(401).send('Invalid signature');

  try {
    const event = await router.parseWebhook(req.body, req.headers, provider);
    console.log(`[webhook] ${provider} ${event.type}`, event.payment?.id);
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookDuplicateError) return res.sendStatus(200);
    throw err;
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
