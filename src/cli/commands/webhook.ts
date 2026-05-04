import { PayBridge } from '../../index';
import { readStdin, parseHeaders, colorize } from '../utils';
import type { Provider } from '../../types';

const PROVIDERS: Provider[] = [
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

function createProviderFromEnv(providerName: Provider): PayBridge {
  const envMap: Record<Provider, { keys: string[]; mapper: (env: NodeJS.ProcessEnv) => any }> = {
    softycomp: {
      keys: ['SOFTYCOMP_API_KEY', 'SOFTYCOMP_SECRET_KEY', 'SOFTYCOMP_WEBHOOK_SECRET'],
      mapper: (env) => ({
        apiKey: env.SOFTYCOMP_API_KEY!,
        secretKey: env.SOFTYCOMP_SECRET_KEY!,
        webhookSecret: env.SOFTYCOMP_WEBHOOK_SECRET,
      }),
    },
    yoco: {
      keys: ['YOCO_API_KEY', 'YOCO_WEBHOOK_SECRET'],
      mapper: (env) => ({ apiKey: env.YOCO_API_KEY!, webhookSecret: env.YOCO_WEBHOOK_SECRET }),
    },
    ozow: {
      keys: ['OZOW_API_KEY', 'OZOW_SITE_CODE', 'OZOW_PRIVATE_KEY'],
      mapper: (env) => ({
        apiKey: env.OZOW_API_KEY!,
        siteCode: env.OZOW_SITE_CODE!,
        privateKey: env.OZOW_PRIVATE_KEY!,
      }),
    },
    payfast: {
      keys: ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE'],
      mapper: (env) => ({
        merchantId: env.PAYFAST_MERCHANT_ID!,
        merchantKey: env.PAYFAST_MERCHANT_KEY!,
        passphrase: env.PAYFAST_PASSPHRASE,
      }),
    },
    paystack: {
      keys: ['PAYSTACK_API_KEY', 'PAYSTACK_WEBHOOK_SECRET'],
      mapper: (env) => ({ apiKey: env.PAYSTACK_API_KEY!, webhookSecret: env.PAYSTACK_WEBHOOK_SECRET }),
    },
    stripe: {
      keys: ['STRIPE_API_KEY', 'STRIPE_WEBHOOK_SECRET'],
      mapper: (env) => ({ apiKey: env.STRIPE_API_KEY!, webhookSecret: env.STRIPE_WEBHOOK_SECRET }),
    },
    peach: {
      keys: ['PEACH_ACCESS_TOKEN', 'PEACH_ENTITY_ID', 'PEACH_WEBHOOK_SECRET'],
      mapper: (env) => ({
        apiKey: env.PEACH_ACCESS_TOKEN!,
        secretKey: env.PEACH_ENTITY_ID!,
        webhookSecret: env.PEACH_WEBHOOK_SECRET,
      }),
    },
    flutterwave: {
      keys: ['FLUTTERWAVE_API_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET'],
      mapper: (env) => ({ apiKey: env.FLUTTERWAVE_API_KEY!, webhookSecret: env.FLUTTERWAVE_WEBHOOK_SECRET }),
    },
    adyen: {
      keys: ['ADYEN_API_KEY', 'ADYEN_MERCHANT_ACCOUNT', 'ADYEN_WEBHOOK_SECRET'],
      mapper: (env) => ({
        apiKey: env.ADYEN_API_KEY!,
        merchantAccount: env.ADYEN_MERCHANT_ACCOUNT!,
        webhookSecret: env.ADYEN_WEBHOOK_SECRET,
      }),
    },
    mercadopago: {
      keys: ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET'],
      mapper: (env) => ({ apiKey: env.MERCADOPAGO_ACCESS_TOKEN!, webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET }),
    },
    razorpay: {
      keys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
      mapper: (env) => ({
        apiKey: env.RAZORPAY_KEY_ID!,
        secretKey: env.RAZORPAY_KEY_SECRET!,
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
      }),
    },
    mollie: {
      keys: ['MOLLIE_API_KEY'],
      mapper: (env) => ({ apiKey: env.MOLLIE_API_KEY! }),
    },
    square: {
      keys: ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID', 'SQUARE_WEBHOOK_SECRET'],
      mapper: (env) => ({
        apiKey: env.SQUARE_ACCESS_TOKEN!,
        locationId: env.SQUARE_LOCATION_ID!,
        webhookSecret: env.SQUARE_WEBHOOK_SECRET,
      }),
    },
    pesapal: {
      keys: ['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET'],
      mapper: (env) => ({ apiKey: env.PESAPAL_CONSUMER_KEY!, secretKey: env.PESAPAL_CONSUMER_SECRET! }),
    },
  };

  const config = envMap[providerName];
  if (!config) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const required = config.keys.filter((k) => !k.includes('WEBHOOK_SECRET'));
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const credentials = config.mapper(process.env);

  return new PayBridge({
    provider: providerName,
    credentials,
    sandbox: true,
    webhookSecret: credentials.webhookSecret,
  });
}

export async function runWebhook(args: string[]): Promise<void> {
  const subcommand = args[0];
  const providerName = args[1] as Provider;

  if (!subcommand || !providerName) {
    console.error('Usage: paybridge webhook verify|parse <provider> [--header key=value]');
    process.exit(1);
  }

  if (!PROVIDERS.includes(providerName)) {
    console.error(`Unknown provider: ${providerName}`);
    console.error(`Available: ${PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  const headerFlags = args.slice(2).filter((a) => a.startsWith('--header')).map((a) => a.replace('--header', '').trim());
  const headersJsonFlag = args.find((a) => a.startsWith('--headers-json='));

  let headers: Record<string, string> = {};
  if (headersJsonFlag) {
    const json = headersJsonFlag.replace('--headers-json=', '');
    try {
      headers = JSON.parse(json);
    } catch {
      console.error('Invalid JSON in --headers-json');
      process.exit(1);
    }
  } else {
    headers = parseHeaders(headerFlags);
  }

  const rawBody = await readStdin();
  let body: any;

  try {
    body = JSON.parse(rawBody);
  } catch {
    body = rawBody;
  }

  let provider: PayBridge;
  try {
    provider = createProviderFromEnv(providerName);
  } catch (error: any) {
    console.error(colorize(error.message, 'red'));
    process.exit(1);
  }

  if (subcommand === 'verify') {
    const valid = provider.verifyWebhook(body, headers);
    if (valid) {
      console.log(colorize('OK', 'green'));
      process.exit(0);
    } else {
      console.log(colorize('INVALID', 'red'));
      process.exit(1);
    }
  } else if (subcommand === 'parse') {
    try {
      const event = provider.parseWebhook(body, headers);
      console.log(JSON.stringify(event, null, 2));
      process.exit(0);
    } catch (error: any) {
      console.error(colorize(`Parse error: ${error.message}`, 'red'));
      process.exit(1);
    }
  } else {
    console.error(`Unknown webhook subcommand: ${subcommand}`);
    console.error('Use "verify" or "parse"');
    process.exit(1);
  }
}
