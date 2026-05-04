import { CryptoRamp, CryptoProvider } from '../../crypto';
import { colorize } from '../utils';

const CRYPTO_PROVIDERS: CryptoProvider[] = ['moonpay', 'yellowcard', 'transak', 'ramp'];

function createCryptoProviderFromEnv(providerName: CryptoProvider): CryptoRamp {
  const envMap: Record<CryptoProvider, { keys: string[]; mapper: (env: NodeJS.ProcessEnv) => any }> = {
    moonpay: {
      keys: ['MOONPAY_API_KEY', 'MOONPAY_SECRET_KEY'],
      mapper: (env) => ({ apiKey: env.MOONPAY_API_KEY!, secretKey: env.MOONPAY_SECRET_KEY! }),
    },
    yellowcard: {
      keys: ['YELLOWCARD_API_KEY', 'YELLOWCARD_SECRET_KEY'],
      mapper: (env) => ({ apiKey: env.YELLOWCARD_API_KEY!, secretKey: env.YELLOWCARD_SECRET_KEY! }),
    },
    transak: {
      keys: ['TRANSAK_API_KEY', 'TRANSAK_SECRET_KEY'],
      mapper: (env) => ({ apiKey: env.TRANSAK_API_KEY!, secretKey: env.TRANSAK_SECRET_KEY! }),
    },
    ramp: {
      keys: ['RAMP_API_KEY'],
      mapper: (env) => ({ apiKey: env.RAMP_API_KEY! }),
    },
    mock: {
      keys: [],
      mapper: () => ({ apiKey: 'mock' }),
    },
  };

  const config = envMap[providerName];
  if (!config) {
    throw new Error(`Unknown crypto provider: ${providerName}`);
  }

  const missing = config.keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const credentials = config.mapper(process.env);

  return new CryptoRamp({
    provider: providerName,
    credentials,
    sandbox: true,
  });
}

export async function runQuote(args: string[]): Promise<void> {
  const providerName = args[0] as CryptoProvider;

  if (!providerName) {
    console.error('Usage: paybridge quote <provider> --direction on|off --fiat-amount N --fiat-currency CUR --asset ASSET --network NET');
    process.exit(1);
  }

  if (!CRYPTO_PROVIDERS.includes(providerName)) {
    console.error(`Unknown crypto provider: ${providerName}`);
    console.error(`Available: ${CRYPTO_PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  const direction = getArg('--direction') as 'on' | 'off' | undefined;
  const fiatAmountStr = getArg('--fiat-amount');
  const fiatCurrency = getArg('--fiat-currency');
  const asset = getArg('--asset');
  const network = getArg('--network');

  if (!direction || !fiatAmountStr || !fiatCurrency || !asset) {
    console.error('Missing required flags: --direction, --fiat-amount, --fiat-currency, --asset');
    process.exit(1);
  }

  const fiatAmount = parseFloat(fiatAmountStr);
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    console.error('Invalid fiat amount (must be positive number)');
    process.exit(1);
  }

  let provider: CryptoRamp;
  try {
    provider = createCryptoProviderFromEnv(providerName);
  } catch (error: any) {
    console.error(colorize(error.message, 'red'));
    process.exit(1);
  }

  try {
    const quote = await provider.getQuote(
      direction,
      fiatAmount,
      fiatCurrency,
      asset,
      network || asset
    );

    console.log(JSON.stringify(quote, null, 2));
    process.exit(0);
  } catch (error: any) {
    console.error(colorize(`Quote error: ${error.message}`, 'red'));
    process.exit(1);
  }
}
