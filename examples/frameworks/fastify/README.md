# paybridge-example-fastify

Fastify integration demonstrating multi-provider routing and webhook handling.

## Setup

```bash
cd examples/frameworks/fastify
npm install
export STRIPE_API_KEY=sk_test_...
export PAYSTACK_API_KEY=sk_test_...
npm run dev
```

## Endpoints

- **POST /checkout** — body: `{ amount, currency, reference, customer }`
- **POST /webhook/:provider** — raw body; verifies signature

## Test webhook locally

Use ngrok / localtunnel + provider sandbox dashboard, or:

```bash
curl -X POST http://localhost:3000/webhook/stripe \
  -H "stripe-signature: t=...,v1=..." \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_test"}'
```

## Notes

Fastify's raw body handling for webhook signature verification uses a custom content-type parser configured per-route.
