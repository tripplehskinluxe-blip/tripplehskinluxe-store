import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { attemptLogin } from '@/lib/login-guard.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Team sign-in. The browser never talks to Supabase's password login directly; it sends the email + password here,
// the server applies the lockout rules (stored in the database), and only then asks Supabase.
export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Not connected' }, { status: 503, headers: NO_STORE });

  const ip = getIp(req);
  if (!rateLimit(`login:${ip}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: NO_STORE });

  let b; try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE }); }

  const signIn = async (email, password) => {
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    return error ? { error: { status: error.status ?? 0 } } : { session: data.session };
  };
  const r = await attemptLogin({ db: supabaseAdmin(), signIn, email: b?.email, password: b?.password, ip });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
