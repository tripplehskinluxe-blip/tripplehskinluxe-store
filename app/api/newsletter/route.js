import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export async function POST(req) {
  if (!rateLimit(`news:${getIp(req)}`, 5, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true });            // honeypot: bots fill hidden fields
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  if (dbConfigured()) {
    const { error } = await supabaseAdmin().from('newsletter_subscribers').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) { console.error('newsletter', error.message); return NextResponse.json({ error: 'Could not subscribe' }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
