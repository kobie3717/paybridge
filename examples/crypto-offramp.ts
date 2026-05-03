/**
 * Example: Crypto off-ramp to ZAR bank account
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

  const offramp = await ramp.createOffRamp({
    cryptoAmount: 100,
    asset: 'USDT',
    network: 'TRON',
    fiatCurrency: 'ZAR',
    bankAccount: {
      accountNumber: '1234567890',
      branchCode: '123456',
      accountHolder: 'Bob Johnson',
      bankName: 'Standard Bank',
    },
    customer: {
      name: 'Bob Johnson',
      email: 'bob@example.com',
      phone: '+27825551234',
    },
    reference: 'OFFRAMP-001',
  });

  console.log('Off-ramp created:', offramp.id);
  console.log('Deposit address:', offramp.depositAddress);
  console.log('Deposit tag:', offramp.depositTag);
  console.log('Status:', offramp.status);
  console.log(`Quote: ${offramp.quote.cryptoAmount} USDT = ${offramp.quote.fiatAmount} ZAR`);
  console.log(`Fee: ${offramp.quote.feeTotal} ZAR (${offramp.quote.feePercent}%)`);
}

main().catch(console.error);
