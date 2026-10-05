import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';
import { settlePayment, isOurReference } from '@/lib/settlement.js';

export const runtime = 'nodejs';

const read = (db, ref) => db.from('orders').select('order_number,payment_status,status').eq('paystack_reference', ref).maybeSingle();

// Used by the confirmation page. Returns no personal data; the reference is an unguessable id.
// Safety net: if the order is still unpaid, ask PAYSTACK (never the browser) whether it was paid, at most once every ~8 seconds
// per order. This covers a missed or delayed webhook. It uses the same settlement code as the webhook.
export async function GET(req) {
  if (!rateLimit(`status:${getIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const ref = new URL(req.url).searchParams.get('reference') || '';
  if (!isOurReference(ref)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  let { data } = await read(db, ref);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (data.payment_status === 'unpaid' && rateLimit(`verify:${ref}`, 1, 8000)) {
    try { await settlePayment(db, ref); } catch (e) { console.error('status fallback failed', e?.message || e); }
    ({ data } = await read(db, ref));
  }
  return NextResponse.json(data);
}
