# CLI Reference

PayBridge ships with a CLI tool for provider testing, webhook debugging, and quote fetching.

## Installation

The CLI is bundled with the npm package:

```bash
npm install paybridge
npx paybridge --version
```

## Commands

### `paybridge providers`

List all supported providers with capabilities.

```bash
npx paybridge providers
```

Output:

```
Provider      | One-time | Subs | Refunds | Webhooks | Currencies
--------------|----------|------|---------|----------|------------
softycomp     | ✅       | ✅   | ✅      | ✅       | ZAR
yoco          | ✅       | ⛔   | ✅      | ✅       | ZAR
stripe        | ✅       | ✅   | ✅      | ✅       | USD,EUR,GBP,ZAR,NGN
...
```

JSON output:

```bash
npx paybridge providers --json
```

### `paybridge test <provider>`

Test a provider's `createPayment` against its sandbox.

```bash
# Test single provider
STRIPE_API_KEY=sk_test_... npx paybridge test stripe

# Test all providers with credentials
STRIPE_API_KEY=sk_test_... \
YOCO_API_KEY=sk_test_... \
npx paybridge test --all
```

Exit code:
- `0` = all tests passed
- `1` = one or more tests failed

### `paybridge webhook verify <provider>`

Verify webhook signature from stdin.

```bash
cat webhook.json | npx paybridge webhook verify stripe \
  --secret whsec_... \
  --header "Stripe-Signature: t=1614021600,v1=..."
```

Exit code:
- `0` = signature valid
- `1` = signature invalid

### `paybridge webhook parse <provider>`

Parse webhook event from stdin.

```bash
cat webhook.json | npx paybridge webhook parse stripe \
  --header "Stripe-Signature: t=1614021600,v1=..."
```

Output:

```json
{
  "type": "payment.completed",
  "payment": {
    "id": "pay_123",
    "status": "completed",
    "amount": 299.00,
    "currency": "ZAR"
  }
}
```

### `paybridge quote <provider>`

Fetch a crypto on/off-ramp quote.

```bash
MOONPAY_API_KEY=pk_test_... npx paybridge quote moonpay \
  --direction on-ramp \
  --fiat-amount 1000 \
  --fiat-currency ZAR \
  --asset USDT \
  --network POLYGON
```

Output:

```json
{
  "fiatAmount": 1000,
  "fiatCurrency": "ZAR",
  "cryptoAmount": 56.78,
  "asset": "USDT",
  "network": "POLYGON",
  "fee": 25.50,
  "rate": 17.60
}
```

### Global flags

- `--version` — Show version
- `--help` — Show help
- `--json` — JSON output (where applicable)

## Environment variables

Provider credentials are read from environment variables:

| Provider | Variables |
|----------|-----------|
| Stripe | `STRIPE_API_KEY` |
| Yoco | `YOCO_API_KEY`, `YOCO_WEBHOOK_SECRET` |
| PayStack | `PAYSTACK_API_KEY`, `PAYSTACK_WEBHOOK_SECRET` |
| MoonPay | `MOONPAY_API_KEY`, `MOONPAY_SECRET_KEY` |
| ... | (see provider docs) |

## Examples

Test all providers with credentials:

```bash
#!/bin/bash
export STRIPE_API_KEY=sk_test_...
export YOCO_API_KEY=sk_test_...
export PAYSTACK_API_KEY=sk_test_...

npx paybridge test --all
```

Verify webhook in CI:

```bash
curl -X POST https://webhook.site/unique-id \
  -H "Content-Type: application/json" \
  -d @webhook.json \
  | npx paybridge webhook verify stripe --secret $STRIPE_WEBHOOK_SECRET
```

## Next steps

- [Provider overview](/providers/overview)
- [Webhook verification](/webhooks/signature-verification)
- [Crypto quotes](/crypto/overview)
