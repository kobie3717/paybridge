# PayBridge Playground

A stunning, interactive payment testing environment built for PayBridge SDK.

## Overview

The playground is a beautiful, modern web app that lets developers:
- Test payments against live SoftyComp sandbox API
- See real-time webhook events via Server-Sent Events
- Generate TypeScript/JavaScript code snippets
- Explore the PayBridge API interactively

## Location

```
/root/paybridge/playground/
```

## Quick Start

```bash
cd /root/paybridge/playground
npm install
npm start
```

Then open http://localhost:4020

## Features Built

### 1. Dashboard Tab
- Live API status indicator (green dot when sandbox is reachable)
- Session statistics (requests, success, failed counts)
- Provider selection grid (SoftyComp active, others "coming soon")
- Quick npm install command
- Test cards displayed in sidebar

### 2. Create Payment Tab
- Beautiful form with all payment fields
- Payment type toggle: Once-off / Monthly / Yearly
- Recurring payment options (start date, billing day)
- Auto-generated reference numbers
- Real-time form validation
- Success panel with:
  - Syntax-highlighted JSON response
  - "Open Payment Page" button (opens checkout URL)
  - Generated TypeScript/JavaScript code snippet
  - Copy to clipboard buttons

### 3. Webhooks Tab (Live)
- Real-time webhook event stream via SSE
- Webhook events appear instantly with:
  - Color-coded badges (pending/completed/failed/cancelled)
  - Timestamp
  - Payment reference and amount
  - Expandable JSON payload viewer
- Webhook URL displayed for easy copying
- Empty state with helpful hints

### 4. Code Generator Tab
- Operation selector (Create Payment, Subscription, Check Status, Refund, Parse Webhook)
- Language toggle (TypeScript / JavaScript)
- Two code panels:
  - PayBridge implementation (clean, simple)
  - Raw API code (complex, shows what PayBridge abstracts away)
- Copy button for quick code snippets

### 5. API Explorer Tab
- Interactive endpoint cards
- Click "Try it" to auto-fill Create Payment form
- Shows HTTP method, endpoint path, and description
- Color-coded by method type (GET=green, POST=blue)

## Design Highlights

### Color Scheme
- Dark navy/charcoal background (#0f172a, #1e293b)
- Electric blue accent (#3B82F6) for primary actions
- Emerald green (#10B981) for success states
- Red (#EF4444) for errors
- Orange (#FBBF24) for pending states

### Typography
- System fonts (Inter, Segoe UI) for UI
- JetBrains Mono for code blocks
- Large, readable sizes
- Excellent contrast ratios

### Animations
- Fade-in transitions on tab switches
- Pulse animation on webhook badges
- Slide-in animation for new webhooks
- Smooth hover states on all interactive elements
- Spinning loader on payment creation button

### Layout
- Fixed left sidebar (280px) with navigation
- Main content area with responsive grid layouts
- Bottom code snippet panel (collapsible)
- Fully responsive (works on mobile)

## Tech Stack

- **Backend**: Express.js (server + API proxy)
- **Frontend**: Vanilla HTML/CSS/JS (no build step!)
- **Real-time**: Server-Sent Events (SSE) for webhooks
- **Payment Processing**: PayBridge SDK

## Architecture

```
playground/
├── server.js              # Express server
│   ├── Serves static files from public/
│   ├── Proxies API calls (credentials stay server-side)
│   ├── Receives webhooks and broadcasts via SSE
│   └── Uses PayBridge internally
├── public/
│   ├── index.html         # 5-tab single-page app
│   ├── style.css          # 1000+ lines of beautiful CSS
│   └── app.js             # Frontend logic (tabs, forms, SSE, code gen)
├── package.json
├── README.md
└── .gitignore
```

## API Endpoints (Backend)

- `GET /api/status` - Check if sandbox API is reachable
- `GET /api/stats` - Get session statistics
- `POST /api/payment` - Create payment (one-time or subscription)
- `GET /api/payment/:id` - Check payment status
- `POST /api/refund` - Process refund
- `POST /webhook` - Receive webhooks, broadcast to SSE clients
- `GET /events` - SSE endpoint for real-time webhook notifications

## Test Cards (SoftyComp Sandbox)

- **4790 4444 xxxx xxxx** - Success (3DS + MOTO)
- **4790 3333 xxxx xxxx** - 3DS success, MOTO fail

## Credentials

Uses SoftyComp sandbox credentials (safe to commit):
- API Key: `97E932D2-EC27-4583-B8E4-EDC87C8019BA`
- Secret Key: `OEPQKMxopavCtvmvwE3Y`
- Environment: Sandbox

## What Makes It Special

1. **Stripe-docs quality** - Professional, polished design
2. **Real API calls** - Not mocked, uses actual SoftyComp sandbox
3. **Real-time webhooks** - SSE streaming, no polling
4. **Progressive disclosure** - Expandable JSON, collapsible code
5. **Copy-paste ready** - Every code snippet is production-ready
6. **No build step** - Just open index.html or run the Express server
7. **Beautiful errors** - Friendly error messages and empty states
8. **Responsive** - Works on desktop, tablet, and mobile

## Testing Checklist

✓ Homepage loads at http://localhost:4020
✓ API status shows "Online" with green dot
✓ Create payment form works (with valid email domain)
✓ Payment returns checkout URL
✓ Response JSON is syntax-highlighted
✓ Code snippet is generated
✓ Stats update after request
✓ Webhooks tab shows empty state
✓ SSE connection established (check console)
✓ Code generator shows all operations
✓ Language toggle switches between TS/JS
✓ API Explorer cards are clickable
✓ All tabs navigate smoothly

## Future Enhancements (Nice-to-Have)

- Add more providers when implemented (Yoco, Ozow, PayFast)
- Dark/light mode toggle
- Save form state to localStorage
- Export webhook log as JSON
- Webhook signature testing
- Payment status polling dashboard
- Transaction history table
- API call performance metrics

## For Demo Purposes

This playground is perfect for:
- Live demos of PayBridge capabilities
- Developer onboarding
- Testing new provider integrations
- Showcasing unified API benefits
- Conference presentations
- Documentation screenshots

**Not intended for production use** - runs on localhost, uses sandbox credentials.

## Powered by PayBridge

One API. Every payment provider.

GitHub: https://github.com/kobie3717/paybridge
