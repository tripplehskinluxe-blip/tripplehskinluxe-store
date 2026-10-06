import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth.js';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { handleTeamAction } from '@/lib/team.js';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Add / remove staff, reset a staff password or authenticator. Admin with two-factor only.
// The checks that matter run in the DATABASE as the signed-in admin (team_* functions), so they hold even if this file had a bug.
// The server's secret key is used only for the three things Supabase allows nobody else to do: create, change and delete a login.
export async function POST(req) {
  const auth = await requireStaff(req, { adminOnly: true });
  if (auth.error) return auth.error;
  if (!rateLimit(`team:${auth.user.id}`, 20, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: NO_STORE });
  if (Number(req.headers.get('content-length') || 0) > 10_000) return NextResponse.json({ error: 'Request too large' }, { status: 413, headers: NO_STORE });

  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE }); }

  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const r = await handleTeamAction({ asUser, adminApi: supabaseAdmin().auth.admin, body });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
