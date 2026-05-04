# Crypto On/Off-Ramp

PayBridge supports crypto on-ramp (fiat → crypto) and off-ramp (crypto → fiat) through unified providers.

## What is on-ramp / off-ramp?

- **On-ramp**: Convert fiat currency (ZAR, USD) to cryptocurrency (USDT, BTC, ETH)
- **Off-ramp**: Convert cryptocurrency back to fiat currency

## Supported providers

| Provider | On-ramp | Off-ramp | Quote | Webhooks | Status |
|----------|---------|----------|-------|----------|--------|
| **MoonPay** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Yellow Card** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | **Experimental** |
| **Transak** | ✅ | ✅ | ✅ | ✅ | **Production** |
| **Ramp Network** | ✅ | ✅ | ✅ | ✅ | **Production** |

**Legend**: ✅ Supported | ⚠️ Experimental (spec unverified)

## Quick start

```typescript
import { CryptoRamp } from 'paybridge/crypto';

const ramp = new CryptoRamp({
  provider: 'moonpay',
  credentials: {
    apiKey: 'your_publishable_key',
    secretKey: 'your_secret_key'
  },
  sandbox: true
});

// Get a quote
const quote = await ramp.getQuote({
  direction: 'on-ramp',
  fiatAmount: 1000,
  fiatCurrency: 'ZAR',
  asset: 'USDT',
  network: 'POLYGON'
});

// Create on-ramp
const result = await ramp.createOnRamp({
  fiatAmount: 1000,
  fiatCurrency: 'ZAR',
  asset: 'USDT',
  network: 'POLYGON',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  customer: {
    email: 'customer@example.com'
  }
});

// Redirect customer to widget
window.location.href = result.widgetUrl;
```

## Multi-provider routing

Use `CryptoRampRouter` for automatic provider selection:

```typescript
import { CryptoRamp, CryptoRampRouter } from 'paybridge/crypto';

const moonpay = new CryptoRamp({ provider: 'moonpay', ... });
const transak = new CryptoRamp({ provider: 'transak', ... });

const router = new CryptoRampRouter({
  providers: [
    { provider: moonpay, weight: 1 },
    { provider: transak, weight: 1 }
  ],
  strategy: 'cheapest', // or 'fastest', 'priority', 'round-robin'
  excludeExperimental: true
});

const result = await router.createOnRamp({ ... });
console.log(result.routingMeta.chosenProvider);
```

## Supported assets

Common across providers:
- **USDT** (Tether)
- **USDC** (USD Coin)
- **BTC** (Bitcoin)
- **ETH** (Ethereum)
- **MATIC** (Polygon)
- **BNB** (Binance Coin)

Each provider supports different networks (Ethereum, Polygon, BSC, Tron).

## Wallet address validation

PayBridge validates wallet addresses per network:
- **BTC**: P2PKH, P2SH, Bech32
- **ETH/POLYGON/BSC**: EIP-55 checksummed addresses
- **TRON**: Base58 with checksum

Invalid addresses throw an error before API calls.

## KYC requirements

All crypto providers require KYC (Know Your Customer) compliance. Customers will be prompted to verify identity during their first transaction.

## Next steps

- [MoonPay configuration](/crypto/moonpay)
- [Transak configuration](/crypto/transak)
- [Ramp Network configuration](/crypto/ramp)
- [Crypto routing strategies](/routing/crypto-router)
