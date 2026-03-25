// ==================== State ====================
let currentTab = 'dashboard';
let currentLanguage = 'typescript';
let currentOperation = 'createPayment';
let webhookCount = 0;

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPaymentForm();
  initCodeGenerator();
  checkAPIStatus();
  loadStats();
  connectToWebhooks();
  generateReference();
});

// ==================== Tab Navigation ====================
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Update active tab button
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  // Update active content
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  currentTab = tabName;
}

// ==================== API Status ====================
async function checkAPIStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();

    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    if (data.online) {
      indicator.classList.add('online');
      statusText.textContent = 'Online';
      statusText.style.color = '#10B981';
    } else {
      indicator.classList.remove('online');
      indicator.style.color = '#EF4444';
      statusText.textContent = 'Offline';
      statusText.style.color = '#EF4444';
    }
  } catch (error) {
    console.error('Failed to check API status:', error);
  }
}

// ==================== Stats ====================
async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    const stats = await response.json();

    document.getElementById('stat-requests').textContent = stats.requests;
    document.getElementById('stat-success').textContent = stats.success;
    document.getElementById('stat-failed').textContent = stats.failed;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// ==================== Payment Form ====================
function initPaymentForm() {
  // Payment type toggle
  const toggles = document.querySelectorAll('.btn-toggle');
  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      toggles.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      document.getElementById('payment-type').value = type;

      // Show/hide recurring fields
      const recurringFields = document.getElementById('recurring-fields');
      if (type !== 'once-off') {
        recurringFields.style.display = 'block';
        setMinDate();
      } else {
        recurringFields.style.display = 'none';
      }
    });
  });

  // Form submission
  const form = document.getElementById('payment-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createPayment();
  });

  // Auto-generate reference on input
  document.getElementById('customer-name').addEventListener('input', generateReference);
}

function setMinDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];
  document.getElementById('start-date').min = minDate;
  document.getElementById('start-date').value = minDate;
}

function generateReference() {
  const name = document.getElementById('customer-name').value || 'Customer';
  const timestamp = Date.now().toString().slice(-6);
  const reference = `${name.replace(/\s+/g, '-').toUpperCase()}-${timestamp}`;
  document.getElementById('reference').value = reference;
}

async function createPayment() {
  const btn = document.getElementById('create-btn');
  btn.classList.add('loading');
  btn.textContent = 'Creating...';

  const formData = {
    amount: document.getElementById('amount').value,
    currency: document.getElementById('currency').value,
    customerName: document.getElementById('customer-name').value,
    customerEmail: document.getElementById('customer-email').value,
    customerPhone: document.getElementById('customer-phone').value,
    reference: document.getElementById('reference').value,
    description: document.getElementById('description').value,
    paymentType: document.getElementById('payment-type').value,
  };

  if (formData.paymentType !== 'once-off') {
    formData.startDate = document.getElementById('start-date').value;
    formData.recurringDay = document.getElementById('recurring-day').value;
  }

  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (data.success) {
      showPaymentResult(data.result, formData);
      loadStats();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Request failed: ' + error.message);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="btn-icon">💳</span> Create Payment';
  }
}

function showPaymentResult(result, formData) {
  const resultPanel = document.getElementById('payment-result');
  const jsonViewer = document.getElementById('result-json');
  const openBtn = document.getElementById('open-payment-btn');
  const codeSnippet = document.getElementById('code-snippet');
  const codeExample = document.getElementById('code-example');

  // Show result
  resultPanel.style.display = 'block';
  jsonViewer.innerHTML = syntaxHighlight(JSON.stringify(result, null, 2));

  // Show open button if checkoutUrl exists
  if (result.checkoutUrl) {
    openBtn.style.display = 'inline-block';
    openBtn.onclick = () => window.open(result.checkoutUrl, '_blank');
  } else {
    openBtn.style.display = 'none';
  }

  // Generate code example
  const isSubscription = formData.paymentType !== 'once-off';
  const code = isSubscription
    ? generateSubscriptionCode(formData)
    : generatePaymentCode(formData);

  codeSnippet.style.display = 'block';
  codeExample.textContent = code;

  // Scroll to result
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeResult() {
  document.getElementById('payment-result').style.display = 'none';
  document.getElementById('code-snippet').style.display = 'none';
}

// ==================== Webhooks (SSE) ====================
function connectToWebhooks() {
  const eventSource = new EventSource('/events');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'connected') {
      console.log('✓ Connected to webhook stream');
      return;
    }

    // New webhook event
    addWebhookEvent(data);
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
  };
}

function addWebhookEvent(webhook) {
  const container = document.getElementById('webhook-events');

  // Remove empty state
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Create webhook card
  const event = webhook.event;
  const eventDiv = document.createElement('div');
  eventDiv.className = 'webhook-event new';

  const timestamp = new Date(webhook.timestamp).toLocaleTimeString();
  const typeClass = event.type.split('.')[1] || 'pending';

  eventDiv.innerHTML = `
    <div class="webhook-header">
      <span class="webhook-type ${typeClass}">${event.type}</span>
      <span class="webhook-timestamp">${timestamp}</span>
    </div>
    <div class="webhook-body">
      <strong>Reference:</strong> ${event.payment?.reference || 'N/A'} •
      <strong>Amount:</strong> R${event.payment?.amount || '0.00'}
    </div>
    <button class="webhook-toggle" onclick="toggleWebhookJson(this)">Show JSON ▼</button>
    <div class="webhook-json">${syntaxHighlight(JSON.stringify(event, null, 2))}</div>
  `;

  // Insert at top
  container.insertBefore(eventDiv, container.firstChild);

  // Update badge
  webhookCount++;
  const badge = document.getElementById('webhook-badge');
  badge.textContent = webhookCount;
  badge.style.display = 'inline-block';

  // Remove "new" class after animation
  setTimeout(() => {
    eventDiv.classList.remove('new');
  }, 2000);
}

function toggleWebhookJson(btn) {
  const jsonDiv = btn.nextElementSibling;
  jsonDiv.classList.toggle('expanded');
  btn.textContent = jsonDiv.classList.contains('expanded')
    ? 'Hide JSON ▲'
    : 'Show JSON ▼';
}

function copyWebhookUrl() {
  const url = 'http://localhost:4020/webhook';
  navigator.clipboard.writeText(url);
  alert('Webhook URL copied to clipboard!');
}

// ==================== Code Generator ====================
function initCodeGenerator() {
  const operationSelect = document.getElementById('operation-select');
  operationSelect.addEventListener('change', (e) => {
    currentOperation = e.target.value;
    updateGeneratedCode();
  });

  const langButtons = document.querySelectorAll('.lang-btn');
  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      langButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentLanguage = btn.dataset.lang;
      updateGeneratedCode();
    });
  });

  updateGeneratedCode();
}

function updateGeneratedCode() {
  const codeElement = document.getElementById('generated-code');
  const rawElement = document.getElementById('raw-code');

  const codes = getCodeForOperation(currentOperation, currentLanguage);
  codeElement.textContent = codes.paybridge;
  rawElement.textContent = codes.raw;
}

function getCodeForOperation(operation, lang) {
  const isTS = lang === 'typescript';

  const codes = {
    createPayment: {
      paybridge: isTS
        ? `import { PayBridge } from 'paybridge';

const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY,
    secretKey: process.env.SOFTYCOMP_SECRET_KEY
  },
  sandbox: true
});

const payment = await pay.createPayment({
  amount: 299.00,
  currency: 'ZAR',
  reference: 'INV-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0825551234'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

// Redirect customer to payment page
res.redirect(payment.checkoutUrl);`
        : `const { PayBridge } = require('paybridge');

const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY,
    secretKey: process.env.SOFTYCOMP_SECRET_KEY
  },
  sandbox: true
});

const payment = await pay.createPayment({
  amount: 299.00,
  currency: 'ZAR',
  reference: 'INV-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0825551234'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

// Redirect customer to payment page
res.redirect(payment.checkoutUrl);`,
      raw: `// Without PayBridge (raw SoftyComp API)

// Step 1: Authenticate
const authResponse = await fetch('https://sandbox.softycomp.co.za/SoftyCompBureauAPI/api/auth/generatetoken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey: process.env.SOFTYCOMP_API_KEY,
    apiSecret: process.env.SOFTYCOMP_SECRET_KEY
  })
});
const { token } = await authResponse.json();

// Step 2: Create bill
const billResponse = await fetch('https://sandbox.softycomp.co.za/SoftyCompBureauAPI/api/paygatecontroller/requestbillpresentment', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    Name: 'John Doe',
    ModeTypeID: 4,
    Emailaddress: 'john@example.com',
    Cellno: '0825551234',
    UserReference: 'INV-001',
    Items: [{
      Description: 'Payment',
      Amount: 299.00,
      FrequencyTypeID: 1,
      DisplayCompanyName: 'Your Company',
      DisplayCompanyContactNo: '',
      DisplayCompanyEmailAddress: 'john@example.com'
    }],
    CallbackUrl: 'https://myapp.com/webhook',
    SuccessURL: 'https://myapp.com/success',
    FailURL: 'https://myapp.com/cancel',
    NotifyURL: 'https://myapp.com/webhook',
    CancelURL: 'https://myapp.com/cancel'
  })
});

const result = await billResponse.json();
res.redirect(result.paymentURL);`
    },
    createSubscription: {
      paybridge: isTS
        ? `import { PayBridge } from 'paybridge';

const subscription = await pay.createSubscription({
  amount: 299.00,
  currency: 'ZAR',
  interval: 'monthly',
  reference: 'SUB-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  },
  startDate: '2026-04-01',
  billingDay: 1
});

res.redirect(subscription.checkoutUrl);`
        : `const subscription = await pay.createSubscription({
  amount: 299.00,
  currency: 'ZAR',
  interval: 'monthly',
  reference: 'SUB-001',
  customer: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  },
  startDate: '2026-04-01',
  billingDay: 1
});

res.redirect(subscription.checkoutUrl);`,
      raw: `// Without PayBridge: same auth + API call as payment,
// but with FrequencyTypeID: 2 (monthly) or 7 (yearly)
// and additional fields: CommencementDate, RecurringDay, etc.
// Much more complex to get right!`
    },
    checkStatus: {
      paybridge: isTS
        ? `const payment = await pay.getPayment('BILL-REF-123');

if (payment.status === 'completed') {
  console.log('Payment received!');
} else if (payment.status === 'pending') {
  console.log('Waiting for payment...');
} else {
  console.log('Payment failed or cancelled');
}`
        : `const payment = await pay.getPayment('BILL-REF-123');

if (payment.status === 'completed') {
  console.log('Payment received!');
} else if (payment.status === 'pending') {
  console.log('Waiting for payment...');
} else {
  console.log('Payment failed or cancelled');
}`,
      raw: `// Raw API call with token management
const token = await authenticate();
const response = await fetch(\`https://sandbox.softycomp.co.za/SoftyCompBureauAPI/api/paygatecontroller/listBillPresentmentDetails/\${ref}/\${ref}\`, {
  headers: { Authorization: 'Bearer ' + token }
});
const result = await response.json();
// Map statusTypeID to human-readable status
const status = mapStatus(result.statusTypeID);`
    },
    refund: {
      paybridge: isTS
        ? `// Full refund
const refund = await pay.refund({
  paymentId: 'TXN-123'
});

// Partial refund
const refund = await pay.refund({
  paymentId: 'TXN-123',
  amount: 100.00,
  reason: 'Customer request'
});

console.log('Refund status:', refund.status);`
        : `// Full refund
const refund = await pay.refund({
  paymentId: 'TXN-123'
});

// Partial refund
const refund = await pay.refund({
  paymentId: 'TXN-123',
  amount: 100.00,
  reason: 'Customer request'
});

console.log('Refund status:', refund.status);`,
      raw: `const token = await authenticate();
const response = await fetch('https://sandbox.softycomp.co.za/SoftyCompBureauAPI/api/paygatecontroller/requestCreditTransaction', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    Reference: 'TXN-123',
    UserReference: 'TXN-123',
    Amount: 100.00
  })
});`
    },
    parseWebhook: {
      paybridge: isTS
        ? `app.post('/webhook', express.json(), (req, res) => {
  // Verify signature (optional but recommended)
  if (!pay.verifyWebhook(req.body, req.headers)) {
    return res.status(400).send('Invalid signature');
  }

  // Parse webhook event
  const event = pay.parseWebhook(req.body);

  switch (event.type) {
    case 'payment.completed':
      console.log('Payment completed:', event.payment);
      // Fulfill order, activate subscription, etc.
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.payment);
      break;
    case 'payment.cancelled':
      console.log('Payment cancelled:', event.payment);
      break;
  }

  res.sendStatus(200);
});`
        : `app.post('/webhook', express.json(), (req, res) => {
  // Verify signature (optional but recommended)
  if (!pay.verifyWebhook(req.body, req.headers)) {
    return res.status(400).send('Invalid signature');
  }

  // Parse webhook event
  const event = pay.parseWebhook(req.body);

  switch (event.type) {
    case 'payment.completed':
      console.log('Payment completed:', event.payment);
      // Fulfill order, activate subscription, etc.
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.payment);
      break;
    case 'payment.cancelled':
      console.log('Payment cancelled:', event.payment);
      break;
  }

  res.sendStatus(200);
});`,
      raw: `app.post('/webhook', express.json(), (req, res) => {
  const event = req.body;

  // Manually map activityTypeID to event type
  let eventType;
  switch (event.activityTypeID) {
    case 2: eventType = 'successful'; break;
    case 3: eventType = 'failed'; break;
    case 4: eventType = 'cancelled'; break;
    default: eventType = 'pending';
  }

  // Manual signature verification
  if (req.headers.signature) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(req.body));
    const expected = hmac.digest('hex');
    if (expected !== req.headers.signature) {
      return res.status(400).send('Invalid');
    }
  }

  // Process event...
  res.sendStatus(200);
});`
    }
  };

  return codes[operation] || codes.createPayment;
}

function copyGeneratedCode() {
  const code = document.getElementById('generated-code').textContent;
  navigator.clipboard.writeText(code);
  alert('Code copied to clipboard!');
}

// ==================== API Explorer ====================
function fillPaymentForm() {
  switchTab('create');
  document.querySelector('[data-type="once-off"]').click();
}

function fillSubscriptionForm() {
  switchTab('create');
  document.querySelector('[data-type="monthly"]').click();
}

// ==================== Code Helpers ====================
function generatePaymentCode(formData) {
  return `const { PayBridge } = require('paybridge');

const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY,
    secretKey: process.env.SOFTYCOMP_SECRET_KEY
  },
  sandbox: true
});

const payment = await pay.createPayment({
  amount: ${formData.amount},
  currency: '${formData.currency}',
  reference: '${formData.reference}',
  description: '${formData.description}',
  customer: {
    name: '${formData.customerName}',
    email: '${formData.customerEmail}',
    phone: '${formData.customerPhone}'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  }
});

// Redirect customer
res.redirect(payment.checkoutUrl);`;
}

function generateSubscriptionCode(formData) {
  return `const { PayBridge } = require('paybridge');

const pay = new PayBridge({
  provider: 'softycomp',
  credentials: {
    apiKey: process.env.SOFTYCOMP_API_KEY,
    secretKey: process.env.SOFTYCOMP_SECRET_KEY
  },
  sandbox: true
});

const subscription = await pay.createSubscription({
  amount: ${formData.amount},
  currency: '${formData.currency}',
  interval: '${formData.paymentType}',
  reference: '${formData.reference}',
  description: '${formData.description}',
  customer: {
    name: '${formData.customerName}',
    email: '${formData.customerEmail}',
    phone: '${formData.customerPhone}'
  },
  urls: {
    success: 'https://myapp.com/success',
    cancel: 'https://myapp.com/cancel',
    webhook: 'https://myapp.com/webhook'
  },
  startDate: '${formData.startDate}',
  billingDay: ${formData.recurringDay}
});

// Redirect customer
res.redirect(subscription.checkoutUrl);`;
}

function copySnippet() {
  const code = document.getElementById('code-example').textContent;
  navigator.clipboard.writeText(code);
  alert('Code copied to clipboard!');
}

function copyCode() {
  const jsonViewer = document.getElementById('result-json');
  const text = jsonViewer.textContent;
  navigator.clipboard.writeText(text);
  alert('Response copied to clipboard!');
}

// ==================== Syntax Highlighting ====================
function syntaxHighlight(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'key';
          return `<span style="color: #3B82F6;">${match}</span>`;
        } else {
          cls = 'string';
          return `<span style="color: #10B981;">${match}</span>`;
        }
      } else if (/true|false/.test(match)) {
        return `<span style="color: #F59E0B;">${match}</span>`;
      } else if (/null/.test(match)) {
        return `<span style="color: #94a3b8;">${match}</span>`;
      }
      return `<span style="color: #F59E0B;">${match}</span>`;
    }
  );
}
