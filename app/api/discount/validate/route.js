import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { dbConfigured } from '@/lib/config.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

const DEMO = {
  WELCOME10: { code: 'WELCOME10', type: 'percent', value: 10, min_order_ngn: 0, active: true },
  SAVE5000: { code: 'SAVE5000', type: 'fixed', value: 5000, min_order_ngn: 50000, active: true },
};

// Codes are not readable by shoppers; they can only test one code at a time, and attempts are rate-limited.
export async function POST(req) {
  if (!rateLimit(`disc:${getIp(req)}`, 15, 60_000)) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return NextResponse.json({ error: 'Invalid code' }, { status: 404 });
  if (!dbConfigured()) return DEMO[code] ? NextResponse.json({ discount: DEMO[code] }) : NextResponse.json({ error: 'Invalid code' }, { status: 404 });
  const { data } = await supabaseAdmin().from('discounts').select('code,type,value,min_order_ngn,active').eq('code', code).eq('active', true).maybeSingle();
  return data ? NextResponse.json({ discount: data }) : NextResponse.json({ error: 'Invalid code' }, { status: 404 });
}
