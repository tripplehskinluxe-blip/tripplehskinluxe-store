import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';
export const maxDuration = 15;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Any staff member (signed in with two-factor) can remove ("hidden") or restore ("published") a review.
// The database itself only allows these two statuses and only lets the status column change, so this route is a thin, logged wrapper.
export async function POST(req) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;
  if (!rateLimit(`review_status:${auth.user.id}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(b.review_id) || !['published', 'hidden'].includes(b.status)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { error } = await supabaseAdmin().from('reviews').update({ status: b.status }).eq('id', b.review_id);
  if (error) { console.error('review set-status failed', error.message); return NextResponse.json({ error: 'Could not update the review' }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}
