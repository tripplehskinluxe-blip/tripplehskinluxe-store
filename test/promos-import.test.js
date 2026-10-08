import test from 'node:test';
import assert from 'node:assert/strict';
import { calcTotals, discountUsable } from '../lib/pricing.js';
import { splitImportBatches, validateProductRow } from '../lib/rows.js';
import { DEFAULT_SETTINGS, buildSettings, sanitize } from '../lib/settings-core.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const code = (o = {}) => ({ code: 'PROMO50', type: 'percent', value: 10, min_order_ngn: 0, active: true, uses: 0, max_uses: 50, expires_at: '2026-12-30T22:59:59Z', ...o });

test('promo: a code works while it is on, before its expiry and below its limit', () => {
  assert.equal(discountUsable(code(), NOW), true);
  assert.equal(discountUsable(code({ max_uses: null, expires_at: null }), NOW), true);                 // empty = unlimited / never expires
  assert.equal(discountUsable(code({ uses: 49 }), NOW), true);
});

test('promo: it stops at the limit, after the expiry, or when switched off', () => {
  assert.equal(discountUsable(code({ uses: 50 }), NOW), false);                                          // exactly 50 of 50 is used up
  assert.equal(discountUsable(code({ uses: 51 }), NOW), false);
  assert.equal(discountUsable(code({ expires_at: '2026-10-31T22:59:59Z' }), NOW), false);
  assert.equal(discountUsable(code({ expires_at: NOW.toISOString() }), NOW), false);                    // the exact expiry moment is already over
  assert.equal(discountUsable(code({ active: false }), NOW), false);
  assert.equal(discountUsable(null, NOW), false); assert.equal(discountUsable(undefined, NOW), false);
});

test('promo: anything unreadable is treated as NOT usable (fails closed)', () => {
  assert.equal(discountUsable(code({ expires_at: 'not a date' }), NOW), false);
  assert.equal(discountUsable(code({ max_uses: 0 }), NOW), false);
  assert.equal(discountUsable(code({ uses: undefined, max_uses: 5 }), NOW), true);                      // no count yet = zero uses
});

test('promo: the Dec 30 expiry covers the WHOLE day in Lagos time, and ends right after', () => {
  const end = '2026-12-30T23:59:59+01:00';
  assert.equal(discountUsable(code({ expires_at: end }), new Date('2026-12-30T22:00:00Z')), true);     // 23:00 in Lagos on Dec 30: still valid
  assert.equal(discountUsable(code({ expires_at: end }), new Date('2026-12-31T00:00:00Z')), false);    // 01:00 in Lagos on Dec 31: over
});

test('promo: checkout maths ignores a code that is expired or used up', () => {
  const items = [{ price: 40000, qty: 1 }]; const settings = DEFAULT_SETTINGS.delivery;
  const good = calcTotals({ items, discount: code({ expires_at: '2099-01-01T00:00:00Z' }), settings });
  assert.equal(good.discount, 4000);
  assert.equal(calcTotals({ items, discount: code({ expires_at: '2020-01-01T00:00:00Z' }), settings }).discount, 0);
  assert.equal(calcTotals({ items, discount: code({ uses: 50, expires_at: '2099-01-01T00:00:00Z' }), settings }).discount, 0);
});

// ---------------- CSV import protections ----------------
const base = (sku, extra = {}) => ({ sku, slug: sku.toLowerCase(), name: 'Serum', brand: 'B', category_id: null, price_ngn: 1000, stock: 3, images: [], is_active: true, ...extra });

test('import: an existing product whose CSV row has NO photos keeps its photos (the bundled products.csv has none)', () => {
  const { fresh, withPhotos, keepPhotos } = splitImportBatches([base('A1')], (s) => s === 'A1');
  assert.equal(fresh.length, 0); assert.equal(withPhotos.length, 0); assert.equal(keepPhotos.length, 1);
  assert.ok(!('images' in keepPhotos[0]), 'images must not be sent, or the old photos would be overwritten');
});

test('import: an existing product WITH photo links gets them replaced', () => {
  const { withPhotos } = splitImportBatches([base('A1', { images: ['https://abcd.supabase.co/x.jpg'] })], () => true);
  assert.deepEqual(withPhotos[0].images, ['https://abcd.supabase.co/x.jpg']);
});

test('import: a re-import never re-activates an archived product, but a new product starts active', () => {
  const b = splitImportBatches([base('OLD'), base('NEW')], (s) => s === 'OLD');
  assert.ok(!('is_active' in b.keepPhotos[0]), 'is_active must not be sent for an existing product');
  assert.equal(b.fresh[0].is_active, true); assert.deepEqual(b.fresh[0].images, []);
});

test('import: every group has the same fields in every row (a database upsert needs that)', () => {
  const rows = [base('N1'), base('N2', { images: ['https://x.supabase.co/a.jpg'] }), base('E1'), base('E2'), base('E3', { images: ['https://x.supabase.co/b.jpg'] })];
  const b = splitImportBatches(rows, (s) => s.startsWith('E'));
  for (const g of [b.fresh, b.withPhotos, b.keepPhotos]) { const keys = new Set(g.map((r) => Object.keys(r).sort().join(','))); assert.ok(keys.size <= 1); }
  assert.equal(b.fresh.length + b.withPhotos.length + b.keepPhotos.length, rows.length);               // nothing lost
});

test('import: a real parsed row with a blank image_urls column ends up in keepPhotos', () => {
  const v = validateProductRow({ sku: 'T-1', name: 'A', brand: 'B', category: 'Skincare', price: 1000, stock: 1, image_urls: '' });
  assert.equal(v.ok, true); assert.deepEqual(v.value.images, []);
  assert.equal(splitImportBatches([v.value], () => true).keepPhotos.length, 1);
});

// ---------------- auto-cancel setting ----------------
test('settings: the auto-cancel time defaults to 72 hours and is editable within limits', () => {
  assert.equal(buildSettings([]).delivery.abandonAfterHours, 72);
  const d = (v) => sanitize('delivery', { ...DEFAULT_SETTINGS.delivery, abandonAfterHours: v });
  assert.equal(d(48).value.abandonAfterHours, 48); assert.equal(d('24').value.abandonAfterHours, 24);
  assert.equal(d(0).ok, false); assert.equal(d(721).ok, false); assert.equal(d(1.5).ok, false); assert.equal(d('soon').ok, false);
  assert.equal(buildSettings([{ key: 'delivery', value: { ...DEFAULT_SETTINGS.delivery, abandonAfterHours: 'junk' } }]).delivery.abandonAfterHours, 72);   // damaged value falls back
});
