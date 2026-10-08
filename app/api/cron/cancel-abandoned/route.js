import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called once a day by Vercel Cron (see vercel.json). Cancels online orders that were never paid after the number of hours set in
// Settings (default 72). Vercel sends  Authorization: Bearer <CRON_SECRET>  when the CRON_SECRET variable exists in the project.
// Without that variable this route refuses everything. Running it twice is harmless.
function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(req.headers.get('authorization') || ''), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: 'Not connected' }, { status: 503 });
  const { data, error } = await supabaseAdmin().rpc('cancel_abandoned_orders');
  if (error) { console.error('cron: cancel_abandoned_orders failed', error.message); return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
  return NextResponse.json({ cancelled: data });
}
