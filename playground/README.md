# PayBridge Playground

Beautiful interactive payment testing environment for PayBridge SDK.

## Features

- **Live API Testing** - Test payments against real SoftyComp sandbox
- **Real-time Webhooks** - See webhook events appear instantly via Server-Sent Events
- **Code Generator** - Generate TypeScript/JavaScript code snippets
- **API Explorer** - Browse all available endpoints
- **Beautiful UI** - Dark mode, modern design, Stripe-docs quality

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Then open http://localhost:4020 in your browser.

## What You Can Do

### 1. Create Payments
- One-time payments
- Monthly subscriptions
- Yearly subscriptions
- Test with real SoftyComp sandbox API

### 2. Watch Webhooks
- Real-time webhook notifications via SSE
- See payment status changes instantly
- View full webhook payloads

### 3. Generate Code
- TypeScript and JavaScript examples
- Copy-paste ready snippets
- See PayBridge vs raw API comparison

### 4. Explore API
- Browse all endpoints
- See request/response formats
- Quick-fill forms with examples

## Test Cards

- **4790 4444 xxxx xxxx** - Success (3DS + MOTO)
- **4790 3333 xxxx xxxx** - 3DS success, MOTO fail

## Configuration

The playground uses SoftyComp sandbox credentials (already configured):

```javascript
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: '97E932D2-EC27-4583-B8E4-EDC87C8019BA',
    secretKey: 'OEPQKMxopavCtvmvwE3Y'
  },
  sandbox: true
});
```

## Architecture

```
playground/
├── server.js           # Express server + API proxy
├── public/
│   ├── index.html      # Main UI
│   ├── style.css       # Styling
│   └── app.js          # Frontend logic
└── package.json
```

## Tech Stack

- **Backend**: Express.js
- **Frontend**: Vanilla HTML/CSS/JS (no build step!)
- **Real-time**: Server-Sent Events (SSE)
- **Payment SDK**: PayBridge

## For Demo Purposes Only

This playground is designed for local testing and demos. It:
- Uses sandbox credentials (safe to commit)
- Runs on localhost only
- Not intended for production use
- Perfect for showcasing PayBridge capabilities

## Powered by PayBridge

One API. Every payment provider.

https://github.com/kobie3717/paybridge
