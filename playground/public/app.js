// ==================== State ====================
let currentTab = 'dashboard';
let currentLanguage = 'typescript';
let currentOperation = 'createPayment';
let webhookCount = 0;

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPaymentForm();
  initBillManagement();
  initDebitOrders();
  initClients();
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
    },
    updateBill: {
      paybridge: `// Update bill presentment details
await pay.provider.updateBillPresentment({
  reference: 'BILL-REF-123',
  amount: 399.00,
  description: 'Updated description',
  customerEmail: 'newemail@example.com'
});`,
      raw: `// Raw SoftyComp API - complex, requires fetching current bill first
const token = await authenticate();
const currentBill = await fetch(baseUrl + '/api/paygatecontroller/listBillPresentmentDetails/BILL-REF-123/BILL-REF-123', {
  headers: { Authorization: 'Bearer ' + token }
}).then(r => r.json());

await fetch(baseUrl + '/api/paygatecontroller/updateBillPresentment', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Reference: 'BILL-REF-123',
    UserReference: currentBill.userReference,
    Items: currentBill.items,
    Emailaddress: 'newemail@example.com'
  })
});`
    },
    expireBill: {
      paybridge: `// Set bill to expired status
await pay.provider.setBillToExpiredStatus('BILL-REF-123', 'USER-REF-123');`,
      raw: `// Raw SoftyComp API
const token = await authenticate();
await fetch(baseUrl + '/api/paygatecontroller/setBillToExpiredStatus/BILL-REF-123/USER-REF-123', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: ''
});`
    },
    billAudits: {
      paybridge: `// List bill audit trail
const audits = await pay.provider.listBillPresentmentAudits('BILL-REF-123', 'USER-REF-123');

audits.forEach(audit => {
  console.log(\`\${audit.timestamp}: \${audit.description} by \${audit.user}\`);
});`,
      raw: `// Raw SoftyComp API
const token = await authenticate();
const response = await fetch(baseUrl + '/api/paygatecontroller/listBillPresentmentAudits/BILL-REF-123/USER-REF-123', {
  headers: { Authorization: 'Bearer ' + token }
});
const audits = await response.json();`
    },
    reauthBill: {
      paybridge: `// Re-authentication bill (card expiry)
const newBill = await pay.provider.createReauthBill({
  oldReference: 'OLD-BILL-123',
  newReference: 'NEW-BILL-456',
  amount: 99.00,
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerPhone: '0825551234',
  description: 'Monthly subscription',
  billingCycle: 'MONTHLY',
  successUrl: 'https://myapp.com/success',
  cancelUrl: 'https://myapp.com/cancel',
  notifyUrl: 'https://myapp.com/webhook'
});

// Redirect customer to new payment page
res.redirect(newBill.checkoutUrl);`,
      raw: `// Raw SoftyComp API - requires multiple steps
// 1. Expire old bill
const token = await authenticate();
await fetch(baseUrl + '/api/paygatecontroller/setBillToExpiredStatus/OLD-BILL-123/OLD-BILL-123', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: ''
});

// 2. Create new bill with recurring settings
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const billResponse = await fetch(baseUrl + '/api/paygatecontroller/requestbillpresentment', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Name: 'John Doe',
    ModeTypeID: 4,
    Emailaddress: 'john@example.com',
    Cellno: '0825551234',
    UserReference: 'NEW-BILL-456',
    Items: [{
      Description: 'Monthly subscription',
      Amount: 99.00,
      FrequencyTypeID: 2, // Monthly
      CommencementDate: tomorrow.toISOString().split('T')[0],
      RecurringDay: tomorrow.getDate(),
      DisplayCompanyName: 'Your Company'
    }],
    SuccessURL: 'https://myapp.com/success',
    CancelURL: 'https://myapp.com/cancel',
    NotifyURL: 'https://myapp.com/webhook'
  })
});`
    },
    mobiMandate: {
      paybridge: `// Create Mobi-Mandate (debit order)
const mandate = await pay.provider.createMobiMandate({
  customerEmail: 'john@example.com',
  customerPhone: '0825551234',
  surname: 'Doe',
  initials: 'J',
  amount: 99.00,
  frequency: 'monthly',
  debitDay: 1,
  description: 'Monthly subscription',
  successUrl: 'https://myapp.com/success'
});

// Redirect customer to sign mandate
res.redirect(mandate.url);`,
      raw: `// Raw SoftyComp API - extremely complex payload
const token = await authenticate();
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const response = await fetch(baseUrl + '/api/mobimandate/generateMobiMandateRequest', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    EmailAddress: 'john@example.com',
    CellphoneNumber: '0825551234',
    ContractCode: 'M' + Date.now().toString().slice(-5),
    Surname: 'Doe',
    Initials: 'J',
    Amount: 99.00,
    InitialAmount: 99.00,
    AccountType: 1,
    CommencementDate: tomorrow.toISOString().split('T')[0],
    CollectionFrequencyTypeID: 2,
    CollectionMethodTypeID: 4,
    DebitDay: 1,
    Description: 'Monthly subscription',
    NaedoTrackingCodeID: 12,
    EntryClassCodeTypeID: 1,
    AdjustmentCategoryTypeID: 2,
    DebiCheckMaximumCollectionAmount: 148.50,
    // ... plus 15+ more required fields
  })
});`
    },
    collectionStatus: {
      paybridge: `// Update collection status (e.g., cancel debit order)
await pay.provider.updateCollectionStatus({
  collectionId: 12345,
  statusTypeId: 6  // 6 = Cancelled
});`,
      raw: `// Raw SoftyComp API
const token = await authenticate();
await fetch(baseUrl + '/api/collections/updateCollectionStatus', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    collectionID: 12345,
    collectionStatusTypeID: 6
  })
});`
    },
    createClient: {
      paybridge: `// Create a new client
const clientId = await pay.provider.createClient({
  name: 'John',
  surname: 'Doe',
  email: 'john@example.com',
  phone: '0825551234',
  idNumber: '8001015009087'
});

console.log('Client created with ID:', clientId);`,
      raw: `// Raw SoftyComp API
const token = await authenticate();
const response = await fetch(baseUrl + '/api/clients/createclient', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: 0,
    clientTypeId: 1,
    contractCode: 'C' + Date.now().toString().slice(-13),
    initials: 'J',
    surname: 'Doe',
    idnumber: '8001015009087',
    clientStatusTypeId: 1,
    cellphoneNumber: '0825551234',
    emailAddress: 'john@example.com',
    sendSmsDonotifications: true,
    sendSmsUnpaidsNotifications: true,
    isSouthAfricanCitizen: true,
    fullNames: 'John'
  })
});
const result = await response.json();
const clientId = result.value;`
    },
    payout: {
      paybridge: `// Create a payout (credit distribution)
const payout = await pay.provider.createCreditDistribution({
  amount: 500.00,
  accountNumber: '1234567890',
  branchCode: '123456',
  accountName: 'John Doe',
  reference: 'PAYOUT-001'
});

console.log('Payout created:', payout.distributionId);`,
      raw: `// Raw SoftyComp API
const token = await authenticate();
const response = await fetch(baseUrl + '/api/creditdistribution/createCreditDistribution', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    creditFileTransactions: [{
      amount: 500.00,
      accountNumber: '1234567890',
      branchCode: '123456',
      accountName: 'John Doe',
      reference: 'PAYOUT-001'
    }]
  })
});
const result = await response.json();`
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

// ==================== Bill Management ====================
function initBillManagement() {
  // Update Bill Form
  document.getElementById('update-bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('update-bill-result');

    try {
      const response = await fetch('/api/update-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: document.getElementById('update-bill-ref').value,
          customerName: document.getElementById('update-bill-name').value,
          amount: document.getElementById('update-bill-amount').value || undefined,
          description: document.getElementById('update-bill-desc').value || undefined,
          customerEmail: document.getElementById('update-bill-email').value || undefined,
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';
      resultDiv.className = data.success ? 'result-message success' : 'result-message error';
      resultDiv.textContent = data.success ? '✓ Bill updated successfully' : `✗ Error: ${data.error}`;
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });

  // Expire Bill Form
  document.getElementById('expire-bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('expire-bill-result');

    try {
      const response = await fetch('/api/expire-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: document.getElementById('expire-bill-ref').value,
          userReference: document.getElementById('expire-user-ref').value,
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';
      resultDiv.className = data.success ? 'result-message success' : 'result-message error';
      resultDiv.textContent = data.success ? '✓ Bill expired successfully' : `✗ Error: ${data.error}`;
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });

  // Audit Trail Form
  document.getElementById('audit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('audit-result');

    try {
      const reference = document.getElementById('audit-bill-ref').value;
      const userReference = document.getElementById('audit-user-ref').value || reference;
      const response = await fetch(`/api/bill-audits/${reference}?userReference=${userReference}`);

      const data = await response.json();
      resultDiv.style.display = 'block';

      if (data.success) {
        resultDiv.className = 'result-message success';
        resultDiv.innerHTML = `<strong>✓ Audit Trail (${data.audits.length} entries)</strong><pre>${JSON.stringify(data.audits, null, 2)}</pre>`;
      } else {
        resultDiv.className = 'result-message error';
        resultDiv.textContent = `✗ Error: ${data.error}`;
      }
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });

  // Re-auth Bill Form
  document.getElementById('reauth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('reauth-result');

    try {
      const response = await fetch('/api/reauth-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldReference: document.getElementById('reauth-old-ref').value,
          newReference: document.getElementById('reauth-new-ref').value,
          amount: document.getElementById('reauth-amount').value,
          billingCycle: document.getElementById('reauth-cycle').value,
          customerName: document.getElementById('reauth-name').value,
          customerEmail: document.getElementById('reauth-email').value,
          customerPhone: document.getElementById('reauth-phone').value,
          description: 'Re-authentication bill',
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';

      if (data.success) {
        resultDiv.className = 'result-message success';
        resultDiv.innerHTML = `<strong>✓ Re-auth bill created</strong><br>Payment URL: <a href="${data.bill.checkoutUrl}" target="_blank">${data.bill.checkoutUrl}</a><pre>${JSON.stringify(data.bill, null, 2)}</pre>`;
      } else {
        resultDiv.className = 'result-message error';
        resultDiv.textContent = `✗ Error: ${data.error}`;
      }
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });
}

// ==================== Debit Orders ====================
function initDebitOrders() {
  // Mobi-Mandate Form
  document.getElementById('mobi-mandate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('mobi-mandate-result');

    try {
      const response = await fetch('/api/mobi-mandate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: document.getElementById('mandate-surname').value,
          initials: document.getElementById('mandate-initials').value || undefined,
          customerEmail: document.getElementById('mandate-email').value,
          customerPhone: document.getElementById('mandate-phone').value,
          amount: document.getElementById('mandate-amount').value,
          frequency: document.getElementById('mandate-frequency').value,
          debitDay: document.getElementById('mandate-debit-day').value,
          idNumber: document.getElementById('mandate-id-number').value || undefined,
          description: document.getElementById('mandate-description').value,
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';

      if (data.success) {
        resultDiv.className = 'result-message success';
        resultDiv.innerHTML = `<strong>✓ Mobi-Mandate created</strong><br>Mandate URL: <a href="${data.mandate.url}" target="_blank">${data.mandate.url}</a><pre>${JSON.stringify(data.mandate, null, 2)}</pre>`;
      } else {
        resultDiv.className = 'result-message error';
        resultDiv.textContent = `✗ Error: ${data.error}`;
      }
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });

  // Collection Status Form
  document.getElementById('collection-status-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('collection-status-result');

    try {
      const response = await fetch('/api/collection-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: document.getElementById('collection-id').value,
          statusTypeId: document.getElementById('status-type-id').value,
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';
      resultDiv.className = data.success ? 'result-message success' : 'result-message error';
      resultDiv.textContent = data.success ? '✓ Collection status updated' : `✗ Error: ${data.error}`;
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });
}

// ==================== Clients & Payouts ====================
function initClients() {
  // Create Client Form
  document.getElementById('create-client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('create-client-result');

    try {
      const response = await fetch('/api/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('client-name').value,
          surname: document.getElementById('client-surname').value,
          email: document.getElementById('client-email').value,
          phone: document.getElementById('client-phone').value,
          idNumber: document.getElementById('client-id-number').value || undefined,
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';

      if (data.success) {
        resultDiv.className = 'result-message success';
        resultDiv.innerHTML = `<strong>✓ Client created</strong><br>Client ID: ${data.clientId}`;
      } else {
        resultDiv.className = 'result-message error';
        resultDiv.textContent = `✗ Error: ${data.error}`;
      }
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });

  // Payout Form
  document.getElementById('payout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('payout-result');

    try {
      const response = await fetch('/api/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: document.getElementById('payout-amount').value,
          reference: document.getElementById('payout-reference').value,
          userReference: document.getElementById('payout-user-reference').value,
          accountName: document.getElementById('payout-account-name').value,
          accountNumber: document.getElementById('payout-account-number').value,
          branchCode: document.getElementById('payout-branch-code').value,
        }),
      });

      const data = await response.json();
      resultDiv.style.display = 'block';

      if (data.success) {
        resultDiv.className = 'result-message success';
        resultDiv.innerHTML = `<strong>✓ Payout created</strong><pre>${JSON.stringify(data.payout, null, 2)}</pre>`;
      } else {
        resultDiv.className = 'result-message error';
        resultDiv.textContent = `✗ Error: ${data.error}`;
      }
      loadStats();
    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'result-message error';
      resultDiv.textContent = `✗ Request failed: ${error.message}`;
    }
  });
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
