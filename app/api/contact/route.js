import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

const t = (v, n) => String(v ?? '').trim().slice(0, n);

export async function POST(req) {
  if (!rateLimit(`contact:${getIp(req)}`, 5, 10 * 60_000)) return NextResponse.json({ error: 'Too many messages. Please try again later.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true });            // honeypot
  const name = `${t(b.first, 60)} ${t(b.last, 60)}`.trim();
  const email = t(b.email, 120).toLowerCase(), phone = t(b.phone, 25), message = t(b.message, 3000);
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || message.length < 5) return NextResponse.json({ error: 'Please check your name, email and message' }, { status: 400 });
  if (dbConfigured()) {
    const { error } = await supabaseAdmin().from('contact_messages').insert({ name, email, phone, message });
    if (error) { console.error('contact', error.message); return NextResponse.json({ error: 'Could not send your message' }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
