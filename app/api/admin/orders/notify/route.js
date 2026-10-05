import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { sendStatusEmailOnce } from '@/lib/settlement.js';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Called by the team area right after a status change. Staff or admin with two-factor only.
// The email is chosen from the order's CURRENT status in the database (shipped / out for delivery / delivered) and each status
// is emailed once, so this cannot be used to send arbitrary or repeated emails.
export async function POST(req) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;
  if (!rateLimit(`notify:${auth.user.id}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const b = await req.json().catch(() => ({}));
  if (!UUID.test(b.order_id)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  try {
    const result = await sendStatusEmailOnce(supabaseAdmin(), b.order_id);
    return NextResponse.json({ result });
  } catch (e) {
    console.error('status email failed', e?.message || e);
    return NextResponse.json({ error: 'Email could not be sent' }, { status: 502 });
  }
}
