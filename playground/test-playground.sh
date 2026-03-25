#!/bin/bash
# Quick verification script for PayBridge Playground

echo "🚀 PayBridge Playground Verification"
echo "===================================="
echo ""

# Start server in background
echo "Starting server..."
cd /root/paybridge/playground
node server.js > /tmp/playground-test.log 2>&1 &
SERVER_PID=$!
sleep 3

# Test 1: Homepage loads
echo "✓ Test 1: Homepage loads"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4020)
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✓ HTTP 200 OK"
else
  echo "  ✗ Failed: HTTP $HTTP_CODE"
fi

# Test 2: API Status
echo "✓ Test 2: API Status endpoint"
STATUS=$(curl -s http://localhost:4020/api/status | jq -r '.online')
if [ "$STATUS" = "true" ]; then
  echo "  ✓ API is online"
else
  echo "  ✗ API is offline"
fi

# Test 3: Create Payment
echo "✓ Test 3: Create Payment"
PAYMENT=$(curl -s -X POST http://localhost:4020/api/payment \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "99.00",
    "currency": "ZAR",
    "customerName": "Test User",
    "customerEmail": "test@gmail.com",
    "customerPhone": "0825551234",
    "reference": "TEST-'$(date +%s)'",
    "description": "Verification Test",
    "paymentType": "once-off"
  }')

SUCCESS=$(echo "$PAYMENT" | jq -r '.success')
CHECKOUT_URL=$(echo "$PAYMENT" | jq -r '.result.checkoutUrl')

if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ Payment created successfully"
  echo "  ✓ Checkout URL: $CHECKOUT_URL"
else
  ERROR=$(echo "$PAYMENT" | jq -r '.error')
  echo "  ✗ Failed: $ERROR"
fi

# Test 4: Stats
echo "✓ Test 4: Session Statistics"
STATS=$(curl -s http://localhost:4020/api/stats)
REQUESTS=$(echo "$STATS" | jq -r '.requests')
echo "  ✓ Requests: $REQUESTS"

# Test 5: SSE connection
echo "✓ Test 5: SSE Endpoint"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -N http://localhost:4020/events &)
SSE_PID=$!
sleep 1
kill $SSE_PID 2>/dev/null
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✓ SSE endpoint reachable"
fi

# Cleanup
echo ""
echo "Stopping server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null

echo ""
echo "===================================="
echo "✓ All tests completed!"
echo ""
echo "To start the playground:"
echo "  cd /root/paybridge/playground"
echo "  npm start"
echo ""
echo "Then open: http://localhost:4020"
