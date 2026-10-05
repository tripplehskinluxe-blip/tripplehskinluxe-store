import 'server-only';
import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { sanitize, SETTING_KEYS } from '@/lib/settings-core.js';
import { allowedImageHosts } from '@/lib/rows.js';

export const runtime = 'nodejs';

// Saves one group of shop settings. Admin with two-factor only.
// 1) the server checks every field (same rules the form shows)  2) the write runs as the SIGNED-IN admin through save_setting(),
// so the database checks "admin + two-factor" again. The server's own master key is never used for this write.
export async function POST(req) {
  const auth = await requireStaff(req, { adminOnly: true });
  if (auth.error) return auth.error;
  if (!rateLimit(`settings:${auth.user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });

  const b = await req.json().catch(() => null);
  if (!b || !SETTING_KEYS.includes(b.key)) return NextResponse.json({ error: 'Unknown setting' }, { status: 400 });

  const r = sanitize(b.key, b.value, { imageHosts: allowedImageHosts(process.env.NEXT_PUBLIC_SUPABASE_URL) });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });

  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await asUser.rpc('save_setting', { p_key: b.key, p_value: r.value });
  if (error) {
    console.error('save_setting', error.message);
    return NextResponse.json({ error: error.code === '42501' ? 'You are not allowed to change settings.' : 'Could not save. Please try again.' }, { status: error.code === '42501' ? 403 : 500 });
  }

  revalidateTag('settings');            // the shop shows the new values straight away
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, value: r.value });
}
