import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { calcTotals } from '@/lib/pricing.js';
import { loadSettings } from '@/lib/settings-core.js';
import { discountUsable } from '@/lib/pricing.js';
import { initializeTransaction } from '@/lib/paystack.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';
import { paymentsConfigured } from '@/lib/config.js';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const json = (body, status = 200) => NextResponse.json(body, { status });

// The browser sends ONLY product ids + quantities. Prices, discounts and delivery are all worked out here.
export async function POST(req) {
  // No Supabase/Paystack keys yet: tell the checkout page to run in demo mode instead of failing.
  if (!paymentsConfigured()) return json({ demo: true, error: 'Payments are not configured yet' }, 503);
  if (!rateLimit(`init:${getIp(req)}`, 10, 60_000)) return json({ error: 'Too many requests. Please wait a minute.' }, 429);

  let b;
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 30) return json({ error: 'Your bag is empty or too large' }, 400);
  for (const i of items)
    if (!UUID.test(i?.product_id) || !Number.isInteger(i?.qty) || i.qty < 1 || i.qty > 20) return json({ error: 'Invalid item in bag' }, 400);

  const name = clean(b.customer?.name, 100);
  const email = clean(b.customer?.email, 120).toLowerCase();
  const phone = clean(b.customer?.phone, 20).replace(/[^\d+]/g, '');
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || phone.replace(/\D/g, '').length < 10)
    return json({ error: 'Please check your name, email and phone number' }, 400);

  const a = b.address || {};
  const address = { state: clean(a.state, 40), city: clean(a.city, 80), address: clean(a.address, 200), landmark: clean(a.landmark, 120), notes: clean(a.notes, 300) };
  if (!address.state || !address.city || !address.address) return json({ error: 'Delivery address is incomplete' }, 400);

  const qtyBy = new Map();
  items.forEach((i) => qtyBy.set(i.product_id, (qtyBy.get(i.product_id) || 0) + i.qty));

  const db = supabaseAdmin();
  const { data: prods, error: pe } = await db.from('products').select('id,name,price_ngn,stock,is_active').in('id', [...qtyBy.keys()]);
  if (pe) { console.error('products lookup', pe.message); return json({ error: 'Something went wrong' }, 500); }

  const lines = [];
  for (const [id, qty] of qtyBy) {
    const p = prods.find((x) => x.id === id);
    if (!p || !p.is_active) return json({ error: 'A product in your bag is no longer available' }, 409);
    if (p.stock < qty) return json({ error: `Only ${p.stock} left of ${p.name}` }, 409);
    lines.push({ product_id: id, name: p.name, price: p.price_ngn, qty });
  }

  let discount = null;
  const code = clean(b.discount_code, 30).toUpperCase();
  if (code) {
    const { data } = await db.from('discounts').select('code,type,value,min_order_ngn,active,uses,max_uses,expires_at').eq('code', code).maybeSingle();
    discount = data || null;
    if (!discountUsable(discount))      // expired, used up or switched off since the customer applied it
      return json({ code: 'PROMO_INVALID', error: 'That promo code is no longer available. The page will refresh so you can review your total.' }, 409);
  }
  // Tidy-up: cancel checkouts that were never paid (best effort; never blocks a customer).
  try { await db.rpc('cancel_abandoned_orders'); } catch { /* ignore */ }
  // Fresh from the database every time (never the cached copy the pages use): this is the number the customer is charged.
  let delivery;
  try { delivery = (await loadSettings(db)).delivery; } catch (e) { console.error('settings lookup', e?.message); return json({ error: 'Something went wrong' }, 500); }   // fail closed: never charge with guessed fees
  const totals = calcTotals({ items: lines, discount, state: address.state, settings: delivery });

  // The customer must be charged exactly what they were shown. If a price or a delivery fee changed in the meantime, stop and tell them.
  if (b.expected_total !== undefined && (!Number.isInteger(b.expected_total) || b.expected_total !== totals.total))
    return json({ code: 'PRICE_CHANGED', error: 'Prices or delivery fees were just updated. The page will refresh so you can review your new total.', total: totals.total }, 409);

  const reference = 'ths_' + crypto.randomUUID();
  const { data: orderNumber, error: oe } = await db.rpc('create_online_order', {
    p: {
      reference, name, email, phone, address,
      items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
      subtotal: totals.subtotal, delivery: totals.delivery, discount: totals.discount,
      discount_code: totals.discountCode, total: totals.total,
    },
  });
  if (oe) { console.error('create_online_order', oe.message); return json({ error: 'We could not place your order. Please try again.' }, 409); }

  const tx = await initializeTransaction({
    email, amountKobo: totals.total * 100, reference,
    callbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/order/confirmation?reference=${reference}`,
    metadata: { order_number: orderNumber },
  });
  if (!tx) {
    await db.from('orders').update({ payment_status: 'failed' }).eq('paystack_reference', reference);
    return json({ error: 'Payment could not be started. Please try again.' }, 502);
  }
  return json({ authorization_url: tx.authorization_url, reference, order_number: orderNumber });
}
