import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';

// Ends the session on the SERVER (the login token stops working), not just in the browser. Safe to call twice.
export async function POST(req) {
  if (!rateLimit(`logout:${getIp(req)}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (token) { try { await supabaseAdmin().auth.admin.signOut(token, 'local'); } catch { /* already ended */ } }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
