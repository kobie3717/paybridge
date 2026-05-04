# Fiat Providers

PayBridge supports 14 production-ready fiat payment providers.

## Supported providers

| Provider | One-time | Subscriptions | Refunds | Webhooks | Status |
|----------|----------|---------------|---------|----------|--------|
| **SoftyComp** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Yoco** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Ozow** | ✅ | ⛔ | ⛔ | ✅ | **Production** |
| **PayFast** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **PayStack** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Stripe** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Peach Payments** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Flutterwave** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Adyen** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Mercado Pago** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Razorpay** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Mollie** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Square** | ✅ | ⛔ | ✅ | ✅ | **Production** |
| **Pesapal** | ✅ | ⛔ | ✅ | ✅ | **Production** |

**Legend**: ✅ Supported | ⛔ Not supported by upstream API

## Notes

- **⛔** marks features the underlying provider's API doesn't support — those methods throw a clear error explaining the limitation
- Use a different provider for unsupported capabilities or use `PayBridgeRouter` to route accordingly
- Most providers are wired and unit-tested; sandbox validation with live credentials is ongoing

## Currency handling

PayBridge **always uses major currency units** (rands, dollars, euros) in the API:

```typescript
// ✅ Correct
{ amount: 299.00, currency: 'ZAR' }

// ❌ Wrong (don't use cents)
{ amount: 29900, currency: 'ZAR' }
```

PayBridge handles provider-specific conversions internally (e.g., Yoco uses cents, SoftyComp uses rands).

## Regional coverage

- **South Africa**: SoftyComp, Yoco, Ozow, PayFast, PayStack, Stripe, Peach Payments
- **West Africa**: PayStack, Flutterwave
- **East Africa**: Pesapal
- **India**: Razorpay
- **Latin America**: Mercado Pago
- **Europe**: Stripe, Adyen, Mollie
- **Global**: Stripe, Square

## Next steps

- [Explore individual provider configurations](/providers/softycomp)
- [Learn about routing strategies](/routing/strategies)
- [Set up multi-provider routing](/routing/overview)
