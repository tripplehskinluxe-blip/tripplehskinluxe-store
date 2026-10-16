import 'server-only';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth.js';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { gotrue } from '@/lib/gotrue.js';
import { handleMfa } from '@/lib/mfa-guard.js';
import { loadSettings, buildSettings } from '@/lib/settings-core.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Every step of the two-factor sign-in happens HERE, not in the browser: checking the code, the lockout, creating the authenticator entry.
// The browser only holds the finished session in memory.
export async function POST(req) {
  const ip = getIp(req);
  if (!rateLimit(`mfa:${ip}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: NO_STORE });
  if (Number(req.headers.get('content-length') || 0) > 2_000) return NextResponse.json({ error: 'Request too large' }, { status: 413, headers: NO_STORE });

  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE }); }

  const db = supabaseAdmin();
  let issuer; try { issuer = (await loadSettings(db)).store.name; } catch { issuer = buildSettings([]).store.name; }     // the shop's name, so the authenticator app shows it
  const r = await handleMfa({ db, gotrue, user: auth.user, role: auth.role, token: auth.token, ip, issuer, body });
  if (r.status === 200 && r.body.session) r.body.name = auth.name;
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
