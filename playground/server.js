/**
 * PayBridge Playground Server
 * Beautiful interactive API testing environment
 */

const express = require('express');
const path = require('path');
const { PayBridge } = require('../dist');

const app = express();
const PORT = 4020;

// In-memory storage for webhooks and stats
const webhooks = [];
const stats = {
  requests: 0,
  success: 0,
  failed: 0,
};

// SSE clients for real-time webhook broadcasting
const sseClients = [];

// Initialize PayBridge with SoftyComp sandbox credentials
const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: '97E932D2-EC27-4583-B8E4-EDC87C8019BA',
    secretKey: 'OEPQKMxopavCtvmvwE3Y',
  },
  sandbox: true,
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== API Endpoints ====================

/**
 * GET /api/status - Check if sandbox API is reachable
 */
app.get('/api/status', async (req, res) => {
  try {
    // Try to get provider info as health check
    const provider = pay.getProviderName();
    const currencies = pay.getSupportedCurrencies();
    res.json({
      online: true,
      provider,
      currencies,
      sandbox: true,
    });
  } catch (error) {
    res.json({
      online: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/stats - Get session statistics
 */
app.get('/api/stats', (req, res) => {
  res.json(stats);
});

/**
 * POST /api/payment - Create a payment
 */
app.post('/api/payment', async (req, res) => {
  stats.requests++;

  try {
    const {
      amount,
      currency,
      customerName,
      customerEmail,
      customerPhone,
      reference,
      description,
      paymentType,
      startDate,
      recurringDay,
    } = req.body;

    let result;

    if (paymentType === 'once-off') {
      // Create one-time payment
      result = await pay.createPayment({
        amount: parseFloat(amount),
        currency,
        reference,
        description,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
        urls: {
          success: `http://localhost:${PORT}/success.html`,
          cancel: `http://localhost:${PORT}/cancel.html`,
          webhook: `http://localhost:${PORT}/webhook`,
        },
      });
    } else {
      // Create subscription (monthly or yearly)
      result = await pay.createSubscription({
        amount: parseFloat(amount),
        currency,
        interval: paymentType,
        reference,
        description,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
        urls: {
          success: `http://localhost:${PORT}/success.html`,
          cancel: `http://localhost:${PORT}/cancel.html`,
          webhook: `http://localhost:${PORT}/webhook`,
        },
        startDate: startDate || undefined,
        billingDay: recurringDay ? parseInt(recurringDay) : undefined,
      });
    }

    stats.success++;
    res.json({ success: true, result });
  } catch (error) {
    stats.failed++;
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/subscription - Create a subscription (alias)
 */
app.post('/api/subscription', async (req, res) => {
  // Reuse payment endpoint
  req.body.paymentType = req.body.interval || 'monthly';
  app.handle(req, res);
});

/**
 * GET /api/payment/:id - Check payment status
 */
app.get('/api/payment/:id', async (req, res) => {
  stats.requests++;

  try {
    const payment = await pay.getPayment(req.params.id);
    stats.success++;
    res.json({ success: true, payment });
  } catch (error) {
    stats.failed++;
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/refund - Process a refund
 */
app.post('/api/refund', async (req, res) => {
  stats.requests++;

  try {
    const { paymentId, amount, reason } = req.body;
    const refund = await pay.refund({
      paymentId,
      amount: amount ? parseFloat(amount) : undefined,
      reason,
    });

    stats.success++;
    res.json({ success: true, refund });
  } catch (error) {
    stats.failed++;
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /webhook - Receive webhooks and broadcast to SSE clients
 */
app.post('/webhook', (req, res) => {
  try {
    // Verify webhook signature (optional)
    const isValid = pay.verifyWebhook(req.body, req.headers);
    if (!isValid) {
      console.warn('⚠️  Webhook signature verification failed');
    }

    // Parse webhook
    const event = pay.parseWebhook(req.body);

    // Add to webhooks array (keep last 50)
    const webhookData = {
      timestamp: new Date().toISOString(),
      event,
      verified: isValid,
    };
    webhooks.unshift(webhookData);
    if (webhooks.length > 50) {
      webhooks.pop();
    }

    // Broadcast to all SSE clients
    broadcastWebhook(webhookData);

    console.log('📨 Webhook received:', event.type, event.payment?.reference);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks - Get recent webhooks
 */
app.get('/api/webhooks', (req, res) => {
  res.json(webhooks);
});

/**
 * GET /events - SSE endpoint for real-time webhook notifications
 */
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Add client to list
  sseClients.push(res);

  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');

  // Remove client on disconnect
  req.on('close', () => {
    const index = sseClients.indexOf(res);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
  });
});

/**
 * Broadcast webhook to all SSE clients
 */
function broadcastWebhook(webhook) {
  const data = JSON.stringify(webhook);
  sseClients.forEach((client) => {
    client.write(`data: ${data}\n\n`);
  });
}

// ==================== Static Pages ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/success.html', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payment Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      color: white;
    }
    .container {
      text-align: center;
    }
    .icon {
      font-size: 80px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 32px;
      margin: 0 0 10px 0;
    }
    p {
      font-size: 18px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>Payment Successful!</h1>
    <p>You can close this window now.</p>
  </div>
</body>
</html>
  `);
});

app.get('/cancel.html', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payment Cancelled</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      color: white;
    }
    .container {
      text-align: center;
    }
    .icon {
      font-size: 80px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 32px;
      margin: 0 0 10px 0;
    }
    p {
      font-size: 18px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✕</div>
    <h1>Payment Cancelled</h1>
    <p>You can close this window now.</p>
  </div>
</body>
</html>
  `);
});

// ==================== Start Server ====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║              🚀  PayBridge Playground                      ║
║                                                            ║
║  Server running at: http://localhost:${PORT}                ║
║                                                            ║
║  Provider:  SoftyComp (Sandbox)                           ║
║  Status:    ✓ Ready to accept payments                    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
