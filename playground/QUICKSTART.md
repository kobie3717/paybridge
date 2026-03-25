# PayBridge Playground - Quick Start

## Start the Playground

```bash
cd /root/paybridge/playground
npm start
```

Open **http://localhost:4020** in your browser.

## Create Your First Payment

1. Click **"Create Payment"** in the sidebar
2. Fill in the form (or use pre-filled example values)
3. Click **"Create Payment"**
4. Click **"Open Payment Page"** to complete the payment
5. Go to **"Webhooks"** tab to see the event arrive in real-time

## Test with Real Cards

Use these test cards in the SoftyComp sandbox:

- **4790 4444 xxxx xxxx** - Success (3DS + MOTO)
- **4790 3333 xxxx xxxx** - 3DS success, MOTO fail

## Explore Features

### Dashboard
- See API status (online/offline)
- View session statistics
- See available providers

### Create Payment
- Test once-off payments
- Test monthly/yearly subscriptions
- Auto-generate payment references
- See live JSON responses

### Webhooks
- Watch events stream in real-time
- See payment status changes instantly
- Expand JSON payloads

### Code Generator
- Generate TypeScript/JavaScript code
- Compare PayBridge vs raw API
- Copy-paste ready snippets

### API Explorer
- Browse all endpoints
- Quick-fill example forms

## Verification Test

```bash
cd /root/paybridge/playground
bash test-playground.sh
```

Should show:
```
✓ Test 1: Homepage loads
✓ Test 2: API Status endpoint
✓ Test 3: Create Payment
✓ Test 4: Session Statistics
✓ Test 5: SSE Endpoint
```

## What You're Testing Against

- **Provider**: SoftyComp (South African bill presentment)
- **Environment**: Sandbox (testapi.softycompdistribution.co.za)
- **Credentials**: Pre-configured sandbox API keys (safe to commit)
- **Currency**: ZAR (South African Rand)

## How It Works

1. **Frontend** (index.html + style.css + app.js) - Single-page app
2. **Backend** (server.js) - Express server that proxies PayBridge SDK
3. **PayBridge SDK** - Handles authentication, API calls, webhooks
4. **SoftyComp Sandbox** - Real API responses

No mocks, no fakes - everything is live against the actual sandbox.

## Troubleshooting

**Server won't start?**
```bash
cd /root/paybridge/playground
npm install
npm start
```

**API status shows offline?**
- Check internet connection
- Verify SoftyComp sandbox is accessible
- Check console for errors

**Payment creation fails?**
- Don't use @example.com emails (SoftyComp rejects them)
- Use @gmail.com or other real domains
- Check that amount is valid (> 0)

**Webhooks not appearing?**
- Check browser console for SSE connection
- Complete the payment in the checkout URL
- Webhook should arrive within seconds

## Stop the Server

Press `Ctrl+C` in the terminal where the server is running.

## Next Steps

- Read [README.md](README.md) for full documentation
- Read [FEATURES.md](FEATURES.md) for feature list
- Check the [main PayBridge README](../README.md) for SDK usage

## Perfect For

- Demos and presentations
- Learning payment APIs
- Testing PayBridge features
- Prototyping payment flows
- Developer onboarding

Enjoy exploring PayBridge! 🚀
