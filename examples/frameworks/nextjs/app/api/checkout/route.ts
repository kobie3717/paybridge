import { NextResponse } from 'next/server';
import { router } from '@/app/lib/paybridge';

export async function POST(req: Request) {
  const { amount, currency, reference, customer } = await req.json();
  const result = await router.createPayment({
    amount,
    currency,
    reference,
    customer,
    urls: {
      success: `${process.env.PUBLIC_URL}/success`,
      cancel: `${process.env.PUBLIC_URL}/cancel`,
      webhook: `${process.env.PUBLIC_URL}/api/webhook/${result.provider}`,
    },
  });
  return NextResponse.json({ checkoutUrl: result.checkoutUrl, id: result.id });
}
