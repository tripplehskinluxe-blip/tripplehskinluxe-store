import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';
import { lockCheck, lockFail, lockClear, lockedReply, hashOf, ipSubject } from '@/lib/lockout.js';

const NOT_FOUND = { error: 'We could not find that order. Check the order number and phone number.' };
const last10 = (s) => String(s || '').replace(/\D/g, '').slice(-10);

// Order numbers are sequential, so the phone number is required too (and attempts are rate-limited) to stop people browsing orders.
export async function POST(req) {
  if (!rateLimit(`track:${getIp(req)}`, 8, 60_000)) return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const num = String(b.order_number || '').trim().toUpperCase();
  const phone = String(b.phone || '').replace(/\D/g, '');
  if (!/^(ONL|STR)-\d{4}-\d{3,8}$/.test(num) || phone.length < 7) return NextResponse.json(NOT_FOUND, { status: 404 });
  if (!dbConfigured()) return NextResponse.json({ error: 'Order tracking is available once the store is live.' }, { status: 503 });

  const db = supabaseAdmin();
  // Guessing phone numbers for an order number is a password guess: 5 wrong tries lock that order's lookup (and the visitor's IP) for 15 minutes, then 30, 60 ...
  const subjects = [`o:${hashOf(num)}`, ipSubject(getIp(req))].filter(Boolean);
  const c = await lockCheck(db, subjects);
  if (c.error) return NextResponse.json({ error: 'Order tracking is temporarily unavailable. Please try again shortly.' }, { status: 503 });     // fail closed
  if (c.until) { const l = lockedReply(c.until); return NextResponse.json(l.body, { status: l.status }); }
  const { data: o } = await db.from('orders').select('id,order_number,status,total_ngn,created_at,customer_phone').eq('order_number', num).maybeSingle();
  if (!o || !o.customer_phone || last10(o.customer_phone) !== last10(phone)) {
    const f = await lockFail(db, subjects);
    if (f.until) { const l = lockedReply(f.until); return NextResponse.json(l.body, { status: l.status }); }
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  await lockClear(db, [`o:${hashOf(num)}`]);
  const { data: items } = await db.from('order_items').select('name,qty').eq('order_id', o.id);
  return NextResponse.json({ order_number: o.order_number, status: o.status, total: o.total_ngn, created_at: o.created_at, items: items || [] });
}
