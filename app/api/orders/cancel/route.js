import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';
import { lockCheck, lockFail, lockClear, lockedReply, hashOf, ipSubject } from '@/lib/lockout.js';
import { finishCancellation } from '@/lib/cancellation.js';

export const runtime = 'nodejs';
export const maxDuration = 30;
const NOT_FOUND = { error: 'We could not find that order. Check the order number and phone number.' };

// A customer cancelling their own order. They prove who they are with the order number AND the phone number used at checkout,
// exactly like order tracking, and guessing is locked out the same way (the two share one counter).
// What may be cancelled, and when, is decided inside the database, not here.
export async function POST(req) {
  if (!rateLimit(`cancel:${getIp(req)}`, 6, 60_000)) return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const num = String(b.order_number || '').trim().toUpperCase();
  const phone = String(b.phone || '').replace(/\D/g, '');
  const reason = String(b.reason || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 200);
  if (!/^ONL-\d{4}-\d{3,8}$/.test(num) || phone.length < 7) return NextResponse.json(NOT_FOUND, { status: 404 });
  if (!dbConfigured()) return NextResponse.json({ error: 'Cancelling is available once the store is live.' }, { status: 503 });

  const db = supabaseAdmin();
  const subjects = [`o:${hashOf(num)}`, ipSubject(getIp(req))].filter(Boolean);
  const c = await lockCheck(db, subjects);
  if (c.error) return NextResponse.json({ error: 'Cancelling is temporarily unavailable. Please try again shortly.' }, { status: 503 });   // fail closed
  if (c.until) { const l = lockedReply(c.until); return NextResponse.json(l.body, { status: l.status }); }

  const { data, error } = await db.rpc('customer_cancel_order', { p_order_number: num, p_phone: phone, p_reason: reason || null });
  if (error) { console.error('customer cancel failed', error.message); return NextResponse.json({ error: 'Something went wrong. Please message us on WhatsApp.' }, { status: 500 }); }
  if (data?.code === 'not_found') {
    const f = await lockFail(db, subjects);
    if (f.until) { const l = lockedReply(f.until); return NextResponse.json(l.body, { status: l.status }); }
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  await lockClear(db, [`o:${hashOf(num)}`]);
  if (data?.code === 'not_cancellable') return NextResponse.json({ error: 'This order can no longer be cancelled online. Please message us on WhatsApp and we will help.' }, { status: 409 });

  // Cancelled. Now refund (paid orders) and email the customer. If either step fails the order stays cancelled and staff see it.
  let refund = data.paid ? 'pending' : 'none';
  try { refund = (await finishCancellation(db, data.order_id)).refund; } catch (e) { console.error('after-cancel step failed', num, e?.message || e); }
  return NextResponse.json({ ok: true, already: !!data.already, refund });
}
