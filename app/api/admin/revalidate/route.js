import 'server-only';
import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';

// Called by the team area right after products or stock change, so the shop shows it at once instead of within a minute.
// Staff or admin with two-factor only. It only ever clears cached copies, so it cannot change any data.
export async function POST(req) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;
  if (!rateLimit(`revalidate:${auth.user.id}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  revalidateTag('catalog');
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
