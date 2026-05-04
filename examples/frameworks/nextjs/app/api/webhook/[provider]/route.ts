import { NextResponse } from 'next/server';
import { router } from '@/app/lib/paybridge';
import { WebhookDuplicateError } from 'paybridge';

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider as any;
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);

  if (!router.verifyWebhook(rawBody, headers, provider)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  try {
    const event = await router.parseWebhook(rawBody, headers, provider);
    console.log(`[webhook] ${provider} ${event.type}`);
    return new NextResponse('ok');
  } catch (err) {
    if (err instanceof WebhookDuplicateError) return new NextResponse('ok');
    throw err;
  }
}
