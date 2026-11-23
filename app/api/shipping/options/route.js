import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { loadSettings } from '@/lib/settings-core.js';
import { loadShippingData } from '@/lib/shipping-data.js';
import { resolveShipping } from '@/lib/shipping-core.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The delivery options for an address, shown at checkout. It only reads the zones; the order is priced again on the server.
export async function GET(req) {
  if (!await rateLimit(`ship:${getIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
  const u = new URL(req.url);
  const state = String(u.searchParams.get('state') || '').slice(0, 40);
  const lga = String(u.searchParams.get('lga') || '').slice(0, 40);
  const address = String(u.searchParams.get('address') || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').slice(0, 300);
  try {
    const db = supabaseAdmin();
    const cfg = await loadSettings(db);
    const data = await loadShippingData(db, cfg.delivery);
    const r = resolveShipping(data, { state, lga, address });
    return NextResponse.json({ ok: r.ok, mode: r.mode, options: r.options.map((o) => ({ id: o.id, type: o.type, label: o.label, fee: o.fee, priced: o.priced })),
      recommended: r.recommended, mismatch: r.mismatch, flags: r.flags }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('shipping options', e?.message);
    return NextResponse.json({ error: 'Delivery options are not available right now.' }, { status: 500 });
  }
}
