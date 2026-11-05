import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';
export const maxDuration = 20;
const TOKEN = /^[0-9a-f]{64}$/;

// GET  ?token=...   -> what the review page shows for a private link (buyer name, which products, which are already reviewed)
// POST { token, product_id, rating, name, body } -> write one review. The database alone decides whether the link may review that product.
export async function GET(req) {
  if (!rateLimit(`review_ctx:${getIp(req)}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'invalid' }, { status: 404 });
  if (!dbConfigured()) return NextResponse.json({ error: 'Reviews are available once the store is live.' }, { status: 503 });
  const { data, error } = await supabaseAdmin().rpc('review_context', { p_token: token });
  if (error) { console.error('review_context failed', error.message); return NextResponse.json({ error: 'Something went wrong' }, { status: 500 }); }
  if (data?.code !== 'ok') return NextResponse.json({ error: 'invalid' }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req) {
  if (!rateLimit(`review_sub:${getIp(req)}`, 10, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || '');
  const name = String(b.name || '').trim();
  const body = String(b.body || '').trim();
  const rating = Number(b.rating);
  if (!TOKEN.test(token) || !b.product_id || !Number.isInteger(rating) || rating < 1 || rating > 5 || !name) {
    return NextResponse.json({ error: 'Please fill in your name and choose a star rating.' }, { status: 400 });
  }
  if (!dbConfigured()) return NextResponse.json({ error: 'Reviews are available once the store is live.' }, { status: 503 });

  const { data, error } = await supabaseAdmin().rpc('submit_review', { p_token: token, p_product: b.product_id, p_rating: rating, p_name: name, p_body: body });
  if (error) { console.error('submit_review failed', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  const MSG = {
    ok: null,
    invalid: 'This review link is no longer valid.',
    not_in_order: 'That product is not in this order.',
    already: 'You have already reviewed this product.',
    bad_input: 'Please check your name, rating and review, then try again.',
    no_links: 'Reviews cannot contain links.',
  };
  const code = data?.code || 'bad_input';
  if (code !== 'ok') return NextResponse.json({ error: MSG[code] || 'Something went wrong.' }, { status: code === 'invalid' ? 404 : code === 'already' ? 409 : 400 });
  return NextResponse.json({ ok: true });
}
