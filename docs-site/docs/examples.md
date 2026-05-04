# Examples

PayBridge ships with runnable integration examples for popular Node.js frameworks.

## Framework examples

All examples demonstrate:

- Multi-provider routing (`PayBridgeRouter`)
- Webhook signature verification
- Webhook idempotency (`InMemoryIdempotencyStore`)
- Raw body parsing for signatures

### Express

Classic Node.js framework.

**Location**: `examples/frameworks/express/`

**Key pattern**: `express.raw()` for webhook raw body

```typescript
app.post('/webhook/:provider', express.raw({ type: 'application/json' }), async (req, res) => {
  const provider = req.params.provider as Provider;
  
  if (!router.verifyWebhook(req.body, req.headers, provider)) {
    return res.status(401).send('Unauthorized');
  }

  const event = await router.parseWebhook(req.body, req.headers, provider);
  // Process event...
  res.sendStatus(200);
});
```

[View full example →](https://github.com/kobie3717/paybridge/tree/master/examples/frameworks/express)

### Fastify

High-performance Node.js framework.

**Location**: `examples/frameworks/fastify/`

**Key pattern**: Custom content-type parser

```typescript
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    done(null, body);
  }
);

fastify.post('/webhook/:provider', async (request, reply) => {
  const provider = request.params.provider as Provider;
  
  if (!router.verifyWebhook(request.body, request.headers, provider)) {
    return reply.status(401).send('Unauthorized');
  }

  const event = await router.parseWebhook(request.body, request.headers, provider);
  return { status: 'ok' };
});
```

[View full example →](https://github.com/kobie3717/paybridge/tree/master/examples/frameworks/fastify)

### Next.js

React framework with App Router.

**Location**: `examples/frameworks/nextjs/`

**Key pattern**: Dynamic route API handler

```typescript
// app/api/webhook/[provider]/route.ts
export async function POST(
  request: Request,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as Provider;
  const body = await request.arrayBuffer();
  const headers = Object.fromEntries(request.headers);

  if (!router.verifyWebhook(Buffer.from(body), headers, provider)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = await router.parseWebhook(Buffer.from(body), headers, provider);
  return Response.json({ status: 'ok' });
}
```

[View full example →](https://github.com/kobie3717/paybridge/tree/master/examples/frameworks/nextjs)

### Hono

Edge-runtime framework (Cloudflare Workers, Bun, Deno, Node).

**Location**: `examples/frameworks/hono/`

**Key pattern**: Works on edge runtimes

```typescript
app.post('/webhook/:provider', async (c) => {
  const provider = c.req.param('provider') as Provider;
  const body = await c.req.arrayBuffer();
  const headers = c.req.raw.headers;

  if (!router.verifyWebhook(Buffer.from(body), Object.fromEntries(headers), provider)) {
    return c.text('Unauthorized', 401);
  }

  const event = await router.parseWebhook(
    Buffer.from(body),
    Object.fromEntries(headers),
    provider
  );

  return c.json({ status: 'ok' });
});
```

[View full example →](https://github.com/kobie3717/paybridge/tree/master/examples/frameworks/hono)

## Running examples

Each example has its own README with setup instructions:

```bash
cd examples/frameworks/express
npm install
cp .env.example .env
# Edit .env with your provider credentials
npm start
```

## Interactive playground

The Stripe-style interactive playground lets you test PayBridge in the browser:

**Location**: `playground/`

Features:

- Create real payments against SoftyComp sandbox
- Watch webhooks arrive in real-time
- Generate code snippets (TypeScript/JavaScript)
- Compare PayBridge vs raw API complexity

```bash
cd playground
npm install
npm start
# Open http://localhost:4020
```

[View playground README →](https://github.com/kobie3717/paybridge/tree/master/playground)

## Multi-provider routing example

Standalone TypeScript example demonstrating all routing features:

**Location**: `examples/multi-provider.ts`

Includes:

- 4 SA providers (SoftyComp, Yoco, PayFast, PayStack)
- `cheapest` strategy
- `InMemoryIdempotencyStore`
- Webhook duplicate handling

[View example →](https://github.com/kobie3717/paybridge/blob/master/examples/multi-provider.ts)

## Next steps

- [Getting started](/getting-started)
- [Routing strategies](/routing/strategies)
- [Webhook idempotency](/webhooks/idempotency)
