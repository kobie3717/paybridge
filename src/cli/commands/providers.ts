import { PayBridge } from '../../index';
import { CryptoRamp, CryptoProvider } from '../../crypto';
import { formatTable, colorize } from '../utils';
import type { Provider } from '../../types';

const FIAT_PROVIDERS: Provider[] = [
  'softycomp',
  'yoco',
  'ozow',
  'payfast',
  'paystack',
  'stripe',
  'peach',
  'flutterwave',
  'adyen',
  'mercadopago',
  'razorpay',
  'mollie',
  'square',
  'pesapal',
];

const CRYPTO_PROVIDERS: CryptoProvider[] = ['moonpay', 'yellowcard', 'transak', 'ramp'];

function createDummyProvider(name: Provider) {
  const dummyCreds: Record<Provider, any> = {
    softycomp: { apiKey: 'dummy', secretKey: 'dummy' },
    yoco: { apiKey: 'dummy' },
    ozow: { apiKey: 'dummy', siteCode: 'dummy', privateKey: 'dummy' },
    payfast: { merchantId: 'dummy', merchantKey: 'dummy' },
    paystack: { apiKey: 'dummy' },
    stripe: { apiKey: 'dummy' },
    peach: { apiKey: 'dummy', secretKey: 'dummy' },
    flutterwave: { apiKey: 'dummy' },
    adyen: { apiKey: 'dummy', merchantAccount: 'dummy' },
    mercadopago: { apiKey: 'dummy' },
    razorpay: { apiKey: 'dummy', secretKey: 'dummy' },
    mollie: { apiKey: 'dummy' },
    square: { apiKey: 'dummy', locationId: 'dummy' },
    pesapal: { apiKey: 'dummy', secretKey: 'dummy' },
  };

  return new PayBridge({
    provider: name,
    credentials: dummyCreds[name],
    sandbox: true,
  });
}

function createDummyCryptoProvider(name: CryptoProvider) {
  const dummyCreds: Record<CryptoProvider, any> = {
    moonpay: { apiKey: 'dummy', secretKey: 'dummy' },
    yellowcard: { apiKey: 'dummy', secretKey: 'dummy' },
    transak: { apiKey: 'dummy', secretKey: 'dummy' },
    ramp: { apiKey: 'dummy' },
    mock: { apiKey: 'dummy' },
  };

  return new CryptoRamp({
    provider: name,
    credentials: dummyCreds[name],
    sandbox: true,
  });
}

export async function runProviders(args: string[]): Promise<void> {
  const isJson = args.includes('--json');

  if (isJson) {
    const fiat = FIAT_PROVIDERS.map((name) => {
      const provider = createDummyProvider(name);
      const caps = provider.provider.getCapabilities();
      return {
        provider: name,
        type: 'fiat',
        region: caps.country || 'N/A',
        currencies: caps.currencies,
        fee: `${caps.fees.percent ?? 0}% + ${caps.fees.fixed ?? 0}`,
        minAmount: caps.minAmount,
        maxAmount: caps.maxAmount,
        avgLatencyMs: caps.avgLatencyMs,
      };
    });

    const crypto = CRYPTO_PROVIDERS.map((name) => {
      const ramp = createDummyCryptoProvider(name);
      const caps = ramp.getCapabilities();
      return {
        provider: name,
        type: 'crypto',
        onRampSupported: !!caps.onRampLimits,
        offRampSupported: !!caps.offRampLimits,
        assets: caps.supportedAssets,
        onRampFeePercent: caps.fees.onRampPercent,
        offRampFeePercent: caps.fees.offRampPercent,
        experimental: caps.experimental,
        avgLatencyMs: caps.avgLatencyMs,
      };
    });

    console.log(JSON.stringify({ fiat, crypto }, null, 2));
    return;
  }

  console.log(colorize('\nFIAT PROVIDERS', 'bright'));
  console.log('==============\n');

  const fiatRows: string[][] = [
    ['PROVIDER', 'REGION', 'CURRENCIES', 'FEE'],
  ];

  for (const name of FIAT_PROVIDERS) {
    const provider = createDummyProvider(name);
    const caps = provider.provider.getCapabilities();
    fiatRows.push([
      name,
      caps.country || 'N/A',
      caps.currencies.join('/'),
      `${caps.fees.percent ?? 0}% + ${caps.fees.fixed ?? 0}`,
    ]);
  }

  console.log(formatTable(fiatRows));

  console.log(colorize('\n\nCRYPTO PROVIDERS', 'bright'));
  console.log('================\n');

  const cryptoRows: string[][] = [
    ['PROVIDER', 'ON-RAMP', 'OFF-RAMP', 'ASSETS', 'FEE (ON/OFF)'],
  ];

  for (const name of CRYPTO_PROVIDERS) {
    const ramp = createDummyCryptoProvider(name);
    const caps = ramp.getCapabilities();

    const onRampIcon = caps.experimental ? '⚠' : caps.onRampLimits ? '✓' : '✗';
    const offRampIcon = caps.experimental ? '⚠' : caps.offRampLimits ? '✓' : '✗';
    const feeText = caps.experimental
      ? '⚠ experimental'
      : `${caps.fees.onRampPercent ?? 0}% / ${caps.fees.offRampPercent ?? 0}%`;

    cryptoRows.push([
      name,
      onRampIcon,
      offRampIcon,
      caps.supportedAssets.slice(0, 4).join('/'),
      feeText,
    ]);
  }

  console.log(formatTable(cryptoRows));
  console.log('');
}
