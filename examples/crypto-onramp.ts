/**
 * Example: Crypto on-ramp with MoonPay
 */

import { CryptoRamp } from '../src';

async function main() {
  const ramp = new CryptoRamp({
    provider: 'moonpay',
    credentials: {
      apiKey: process.env.MOONPAY_API_KEY || '',
      secretKey: process.env.MOONPAY_SECRET_KEY || '',
    },
    sandbox: true,
  });

  const quote = await ramp.getQuote('on', 1000, 'ZAR', 'USDT', 'TRON');
  console.log('Quote:', quote);
  console.log(`1000 ZAR = ${quote.cryptoAmount} USDT`);
  console.log(`Fee: ${quote.feeTotal} ZAR (${quote.feePercent}%)`);

  const onramp = await ramp.createOnRamp({
    fiatAmount: 1000,
    fiatCurrency: 'ZAR',
    asset: 'USDT',
    network: 'TRON',
    destinationWallet: 'TRX1234567890ABCDEF',
    customer: {
      name: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+27825551234',
    },
    urls: {
      success: 'https://myapp.com/success',
      cancel: 'https://myapp.com/cancel',
      webhook: 'https://myapp.com/webhook',
    },
    reference: 'ONRAMP-001',
  });

  console.log('\nOn-ramp created:', onramp.id);
  console.log('Checkout URL:', onramp.checkoutUrl);
  console.log('Status:', onramp.status);
}

main().catch(console.error);
