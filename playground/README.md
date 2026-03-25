# PayBridge Playground

**Interactive demonstration of PayBridge — the unified payment SDK for South African payment providers.**

![PayBridge](https://img.shields.io/badge/PayBridge-v0.1.3-6C3CE1)
![SoftyComp](https://img.shields.io/badge/SoftyComp-Complete-10B981)
![Status](https://img.shields.io/badge/Status-Live-success)

## 🚀 Quick Start

```bash
# Start the playground
cd /root/paybridge/playground
pm2 start server.js --name paybridge-playground

# Or run directly
node server.js
```

Access at: **http://localhost:4020**

## 📋 Features

### 8 Interactive Tabs

1. **Dashboard** - Provider status, API health, session statistics
2. **Create Payment** - One-time payments and recurring subscriptions
3. **Bill Management** - Update, expire, audit, re-authenticate bills
4. **Debit Orders** - Mobi-Mandate creation and collection management
5. **Clients & Payouts** - Client registration and credit distributions
6. **Webhooks** - Real-time webhook viewer with SSE
7. **Code Generator** - TypeScript/JavaScript examples with side-by-side comparison
8. **API Explorer** - Complete API documentation (12 endpoints)

### Complete SoftyComp Coverage

✅ **Bill Presentment** - Create, update, expire, audit bills
✅ **Debit Orders** - Mobi-Mandate creation and collection management
✅ **Client Management** - Register new clients
✅ **Payouts** - Credit distributions (reverse payments)
✅ **Re-authentication** - Handle card expiry flows
✅ **Webhooks** - Real-time event notifications with SSE

## 🎨 UI/UX

- **Dark Theme** - Purple branding (#6C3CE1)
- **Responsive** - Works on mobile, tablet, desktop
- **Real-time** - Webhook events via Server-Sent Events (SSE)
- **Code Examples** - Copy-paste ready TypeScript/JavaScript
- **Side-by-side Comparison** - PayBridge vs Raw SoftyComp API

## 📡 API Endpoints (12 Total)

### Payments & Subscriptions
- `POST /api/payment` - Create payment
- `POST /api/subscription` - Create subscription
- `GET /api/payment/:id` - Check status
- `POST /api/refund` - Process refund

### Bill Management
- `POST /api/update-bill` - Update bill presentment
- `POST /api/expire-bill` - Expire bill
- `GET /api/bill-audits/:reference` - Audit trail
- `POST /api/reauth-bill` - Re-authentication

### Debit Orders
- `POST /api/mobi-mandate` - Create Mobi-Mandate
- `POST /api/collection-status` - Update collection

### Clients & Payouts
- `POST /api/client` - Create client
- `POST /api/payout` - Credit distribution

## 🧪 Testing

Run the test script:

```bash
/root/test-paybridge-new-methods.sh
```

## 🔐 Credentials

Sandbox mode enabled by default:

```javascript
{
  apiKey: '97E932D2-EC27-4583-B8E4-EDC87C8019BA',
  secretKey: 'OEPQKMxopavCtvmvwE3Y',
  sandbox: true
}
```

## 🛠️ Tech Stack

- **Backend**: Express.js, PayBridge SDK
- **Frontend**: Vanilla JavaScript, CSS3
- **Real-time**: Server-Sent Events (SSE)
- **Payment Provider**: SoftyComp (Sandbox)

---

**Built with PayBridge** — One API. Every payment provider.
