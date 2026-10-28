import { handlePaystackWebhook, MAX_WEBHOOK_BYTES } from '@/lib/settlement.js';
import { supabaseAdmin } from '@/lib/supabase-admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const reply = (status, body) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function POST(req) {
  try {
    if (Number(req.headers.get('content-length') || 0) > MAX_WEBHOOK_BYTES) return reply(413, 'too large');
    const raw = Buffer.from(await req.arrayBuffer());
    const r = await handlePaystackWebhook({
      raw,
      signature: req.headers.get('x-paystack-signature') || '',
      secret: process.env.PAYSTACK_SECRET_KEY,
      db: supabaseAdmin,
    });
    return reply(r.status, r.body);
  } catch (e) {
    console.error('paystack webhook error', e?.message || e);
    return reply(500, 'error');
  }
}

export async function GET() {
  return reply(200, 'ok');
}
