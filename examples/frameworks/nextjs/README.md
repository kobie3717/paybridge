# paybridge-example-nextjs

Next.js App Router integration demonstrating multi-provider routing and webhook handling.

## Setup

This is a snippet to drop into an existing Next.js 15+ app with App Router.

```bash
cd examples/frameworks/nextjs
npm install
export STRIPE_API_KEY=sk_test_...
export PAYSTACK_API_KEY=sk_test_...
export PUBLIC_URL=http://localhost:3000
npm run dev
```

## Structure

```
app/
├── api/
│   ├── checkout/route.ts
│   └── webhook/[provider]/route.ts
└── lib/
    └── paybridge.ts
```

## Endpoints

- **POST /api/checkout** — body: `{ amount, currency, reference, customer }`
- **POST /api/webhook/:provider** — raw body; verifies signature

## Test webhook locally

Use ngrok / localtunnel + provider sandbox dashboard, or:

```bash
curl -X POST http://localhost:3000/api/webhook/stripe \
  -H "stripe-signature: t=...,v1=..." \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_test"}'
```

## Notes

- Ensure `tsconfig.json` includes the `@/*` path alias pointing to `./app/*`
- The router is initialized once in `app/lib/paybridge.ts` and imported by routes
- Next.js App Router automatically handles raw body parsing for API routes
