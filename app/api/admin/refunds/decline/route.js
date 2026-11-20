import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { declineRefund } from '@/lib/cancellation.js';

export const runtime = 'nodejs';
export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES = { forbidden: 'You are not allowed to do this. Refund decisions need the refund permission and a two-factor sign-in, and you cannot decide a cancellation you made yourself.', not_awaiting: 'This refund is no longer waiting for a decision.', not_refundable: 'This order can no longer be refunded.' };

// The decision runs as the SIGNED-IN person, so the database itself checks their permission and two-factor session (not this route).
export async function POST(req) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;
  if (!await rateLimit(`refdecline:${auth.user.id}`, 20, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(b.order_id)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const note = String(b.note || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 200);
  const r = await declineRefund(asUser, supabaseAdmin(), b.order_id, note);
  if (!r.ok) return NextResponse.json({ error: MESSAGES[r.code] || 'Could not decline the refund' }, { status: r.code === 'forbidden' ? 403 : r.code === 'failed' ? 400 : 409 });
  return NextResponse.json({ ok: true, reinstated: r.reinstated, email: r.email });
}
