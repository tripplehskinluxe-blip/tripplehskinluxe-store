import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';
import { addResendContact } from '@/lib/resend-contacts.js';
import { emailConfigured, sendEmail, newsletterWelcomeEmail } from '@/lib/email.js';
import { loadSettings, buildSettings } from '@/lib/settings-core.js';

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
  // Best-effort, after the signup itself has succeeded: save to the Resend contacts list and send the welcome email.
  // Neither can fail the signup.
  try {
    const r = await addResendContact(email);
    if (!r.ok && r.reason !== 'not_configured') console.error('newsletter: resend contact failed', email, r.reason);
  } catch (e) { console.error('newsletter: resend contact threw', email, e?.message || e); }
  if (emailConfigured()) {
    try {
      let settings; try { settings = await loadSettings(dbConfigured() ? supabaseAdmin() : null); } catch { settings = buildSettings([]); }
      await sendEmail({ to: email, ...newsletterWelcomeEmail(email, settings) });
    } catch (e) { console.error('newsletter: welcome email failed', email, e?.message || e); }
  }
  return NextResponse.json({ ok: true });
}
