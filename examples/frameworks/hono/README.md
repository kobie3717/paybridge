# paybridge-example-hono

Hono integration demonstrating multi-provider routing and webhook handling. Edge-runtime ready (Cloudflare Workers, Bun, Deno, Node).

## Setup

```bash
cd examples/frameworks/hono
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

- This example uses `@hono/node-server` for Node.js runtime
- Hono is runtime-agnostic and works on Cloudflare Workers, Bun, Deno, and Node
- For edge runtimes, replace `InMemoryIdempotencyStore` with a worker-compatible adapter (e.g., Redis with Cloudflare Workers KV bindings)
- The exported `app.fetch` can be deployed directly to Cloudflare Workers
