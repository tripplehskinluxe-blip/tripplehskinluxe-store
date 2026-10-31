import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { finishCancellation } from '@/lib/cancellation.js';

export const runtime = 'nodejs';
export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff or admin (signed in with two-factor) cancelling an order. Stock goes back and the order is cancelled inside the database;
// this route then refunds a paid online order through Paystack and emails the customer, each at most once.
export async function POST(req) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;
  if (!rateLimit(`admcancel:${auth.user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(b.order_id)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.rpc('cancel_order_for', { p_actor: auth.user.id, p_order: b.order_id });
  if (error) { console.error('admin cancel failed', error.message); return NextResponse.json({ error: 'Could not cancel the order' }, { status: 400 }); }
  try {
    const r = await finishCancellation(db, b.order_id);
    return NextResponse.json({ ok: true, refund: r.refund, email: r.email });
  } catch (e) {
    console.error('after-cancel step failed', b.order_id, e?.message || e);
    return NextResponse.json({ ok: true, refund: 'pending', email: 'failed' });
  }
}
