# E2E Test Harnesses

End-to-end test harnesses for external provider integrations.

## MoonPay Sandbox

Verifies MoonPay driver against documented spec.

```bash
# Run vector tests + webhook roundtrip (no credentials needed)
npm run test:e2e:moonpay

# Run with live sandbox API calls
MOONPAY_API_KEY=pk_test_xxx MOONPAY_SECRET_KEY=sk_test_xxx npm run test:e2e:moonpay
```

Tests:
- Vector test: known input/output signature verification
- Spec replication: algorithm matches MoonPay reference implementation
- Webhook V2 roundtrip: valid signature, tampered body, expired timestamp
- Live sandbox (optional): quote API, widget URL generation

Exit code 1 if any test fails.
