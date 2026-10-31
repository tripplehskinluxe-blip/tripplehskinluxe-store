import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { refundOrder, sendRefundEmailOnce } from '@/lib/cancellation.js';

export const runtime = 'nodejs';
export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Refund now" / "Retry refund" for a CANCELLED, PAID online order. The database allows one refund per order and only for the exact
// amount that was paid, so pressing this twice (or by mistake) can never refund twice.
export async function POST(req) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;
  if (!rateLimit(`admrefund:${auth.user.id}`, 20, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(b.order_id)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  const db = supabaseAdmin();
  const r = await refundOrder(db, b.order_id, { manual: true });
  if (r.state === 'issued') {
    let email = 'failed';
    try { email = await sendRefundEmailOnce(db, b.order_id); } catch (e) { console.error('refund email failed', e?.message || e); }
    return NextResponse.json({ ok: true, refund: 'issued', email });
  }
  const error = r.state === 'busy' ? 'A refund request is already in progress. Check again in a minute.' : r.state === 'none' ? 'This order has nothing to refund.' : `The refund did not go through${r.error ? `: ${r.error}` : ''}`;
  return NextResponse.json({ ok: false, refund: r.state, error }, { status: 409 });
}
