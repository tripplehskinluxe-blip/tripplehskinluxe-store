import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { calcTotals as calc } from '../lib/pricing.js';
import { DEFAULT_SETTINGS } from '../lib/settings-core.js';
// The delivery fees are no longer typed into the pricing code; these tests pass the shop's starting values in, like the server does.
const calcTotals = (o) => calc({ settings: DEFAULT_SETTINGS.delivery, ...o });
import { verifyPaystackSignature } from '../lib/paystack.js';
import { validateProductRow, slugify } from '../lib/rows.js';
import { rateLimit } from '../lib/ratelimit.js';

const items = (price, qty = 1) => [{ price, qty }];
const WELCOME = { code: 'WELCOME10', type: 'percent', value: 10, min_order_ngn: 0, active: true };
const SAVE = { code: 'SAVE5000', type: 'fixed', value: 5000, min_order_ngn: 50000, active: true };

test('WELCOME10 takes 10% off and adds Lagos delivery', () => {
  const t = calcTotals({ items: items(15000, 2), discount: WELCOME, state: 'Lagos' });
  assert.deepEqual([t.subtotal, t.discount, t.delivery, t.total], [30000, 3000, 2000, 29000]);
});
test('SAVE5000 needs an order strictly over ₦50,000', () => {
  assert.equal(calcTotals({ items: items(50000), discount: SAVE }).discount, 0);
  const t = calcTotals({ items: items(60000), discount: SAVE });
  assert.deepEqual([t.discount, t.delivery, t.total], [5000, 0, 55000]);
});
test('a discount can never push the total negative', () => {
  const t = calcTotals({ items: items(3000), discount: { ...WELCOME, type: 'fixed', value: 99999 } });
  assert.equal(t.discount, 3000);
  assert.ok(t.total >= 0);
});
test('outside Lagos always pays the nationwide fee; Lagos is free over the threshold', () => {
  assert.equal(calcTotals({ items: items(90000), state: 'Rivers' }).delivery, 4500);
  assert.equal(calcTotals({ items: items(90000), state: ' lagos ' }).delivery, 0);
});
test('inactive discount codes are ignored', () => {
  assert.equal(calcTotals({ items: items(20000), discount: { ...WELCOME, active: false } }).discount, 0);
});

test('Paystack signature: valid, tampered, wrong secret, missing', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ths_x' } });
  const good = crypto.createHmac('sha512', 'sk_test_abc').update(body).digest('hex');
  assert.equal(verifyPaystackSignature(body, good, 'sk_test_abc'), true);
  assert.equal(verifyPaystackSignature(body + ' ', good, 'sk_test_abc'), false);
  assert.equal(verifyPaystackSignature(body, good, 'sk_test_other'), false);
  assert.equal(verifyPaystackSignature(body, '', 'sk_test_abc'), false);
  assert.equal(verifyPaystackSignature(body, 'abc', 'sk_test_abc'), false);
  assert.equal(verifyPaystackSignature(body, good, ''), false);
});

test('product rows: good row passes and is cleaned', () => {
  const r = validateProductRow({ sku: 'TH-1', name: ' Shea Butter ', price: '₦9,500', old_price: '11000', stock: '12', tags: 'Body|Shea', image_urls: 'https://a.com/x.jpg|http://bad.com/y.jpg' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.value.price_ngn, r.value.old_price_ngn, r.value.stock, r.value.slug], [9500, 11000, 12, 'shea-butter']);
  assert.deepEqual(r.value.tags, ['body', 'shea']);
  assert.deepEqual(r.value.images, ['https://a.com/x.jpg']); // http:// image dropped
});
test('product rows: bad data is rejected', () => {
  assert.equal(validateProductRow({ sku: 'A1', name: 'X', price: 'abc' }).ok, false);
  assert.equal(validateProductRow({ sku: 'A1', name: 'X', price: '100', stock: '-3' }).ok, false);
  assert.equal(validateProductRow({ sku: 'bad sku!', name: 'X', price: '100' }).ok, false);
  assert.equal(validateProductRow({ sku: 'A1', name: '', price: '100' }).ok, false);
  assert.equal(validateProductRow({ sku: 'A1', name: 'X', price: '100', old_price: '90' }).ok, false);
  assert.equal(validateProductRow({ sku: 'A1', name: 'X', price: '12.5' }).ok, false);
});
test('slugify', () => assert.equal(slugify('Vitamin C Brightening Serum!'), 'vitamin-c-brightening-serum'));

test('rate limiter blocks after the limit', () => {
  const k = 't' + Math.random();
  assert.deepEqual([1, 2, 3, 4].map(() => rateLimit(k, 3, 60000)), [true, true, true, false]);
});

// ---- catalogue: Makeup removed, Spa & Wellness added ----
import { SEED_PRODUCTS, CATEGORIES } from '../data/seed-products.js';
import { filterProducts, matchText } from '../lib/filter.js';
import { art, shapeFor } from '../lib/art.js';
import { buildQuery, logoParts } from '../lib/format.js';

test('catalogue has no Makeup and has a Spa & Wellness category', () => {
  assert.equal(CATEGORIES.some((c) => /makeup/i.test(c.name)), false);
  assert.equal(SEED_PRODUCTS.some((p) => /makeup|lipstick|blush|concealer|foundation/i.test(p.category + p.name)), false);
  assert.ok(CATEGORIES.some((c) => c.name === 'Spa & Wellness'));
  assert.ok(SEED_PRODUCTS.filter((p) => p.category === 'Spa & Wellness').length >= 5);
  assert.ok(SEED_PRODUCTS.every((p) => CATEGORIES.some((c) => c.name === p.category)), 'every product belongs to a listed category');
});
test('product ids, slugs and skus are unique', () => {
  for (const k of ['id', 'slug', 'sku']) assert.equal(new Set(SEED_PRODUCTS.map((p) => p[k])).size, SEED_PRODUCTS.length, k);
});
test('filtering: search, category, price, sale, availability, sort', () => {
  assert.ok(filterProducts(SEED_PRODUCTS, { q: 'serum' }).length >= 4);
  assert.ok(filterProducts(SEED_PRODUCTS, { cat: 'Spa & Wellness' }).every((p) => p.category === 'Spa & Wellness'));
  assert.ok(filterProducts(SEED_PRODUCTS, { price: '0-10000' }).every((p) => p.price <= 10000));
  assert.ok(filterProducts(SEED_PRODUCTS, { price: '30000-' }).every((p) => p.price >= 30000));
  assert.ok(filterProducts(SEED_PRODUCTS, { flag: 'sale' }).every((p) => p.discount > 0));
  assert.ok(filterProducts(SEED_PRODUCTS, { avail: 'in' }).every((p) => p.stock > 0));
  const asc = filterProducts(SEED_PRODUCTS, { sort: 'plh' }).map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  assert.equal(filterProducts(SEED_PRODUCTS, { q: 'zzzz-nothing' }).length, 0);
  assert.equal(matchText({ name: 'Shea Body Butter', brand: 'Nourish Co.', category: 'Body Care', subcategory: 'Body Butter', sku: 'X', tags: [] }, 'shea butter'), true);
});
test('product art is safe and never throws', () => {
  const svg = art({ id: 'x', slug: 'x', name: '<script>alert(1)</script>', brand: '"><img src=x>', category: 'Spa & Wellness', subcategory: 'Candles' }, 2);
  assert.ok(svg.startsWith('<svg') && !svg.includes('<script') && !svg.includes('<img'));
  assert.equal(shapeFor({ subcategory: 'Serums', name: 'X', category: 'Skincare' }), 'd');
  assert.equal(shapeFor({ subcategory: '', name: '', category: 'Spa & Wellness' }), 's');
});
test('format helpers', () => {
  assert.deepEqual(logoParts('Tripple H Skin Luxe'), ['TRIPPLE H', 'SKIN LUXE']);
  assert.equal(buildQuery({ q: 'a b', cat: '' }, { page: 2 }), '?q=a+b&page=2');
});

// ---- hidden admin address ----
import { resolveAdminRoute } from '../lib/admin-route.js';
const SECRET = 'ops-1a2b3c4d5e6f';
test('admin: internal route is never reachable directly', () => {
  assert.equal(resolveAdminRoute('/internal-admin', SECRET).action, 'block');
  assert.equal(resolveAdminRoute('/internal-admin/orders', SECRET).action, 'block');
  assert.equal(resolveAdminRoute('/internal-admin/orders', '').action, 'block');
});
test('admin: the secret path is rewritten, look-alikes are not', () => {
  assert.deepEqual(resolveAdminRoute('/' + SECRET, SECRET), { action: 'rewrite', to: '/internal-admin' });
  assert.deepEqual(resolveAdminRoute(`/${SECRET}/orders/abc`, SECRET), { action: 'rewrite', to: '/internal-admin/orders/abc' });
  assert.equal(resolveAdminRoute('/' + SECRET + 'x', SECRET).action, 'next');
  assert.equal(resolveAdminRoute('/admin', SECRET).action, 'next');     // no such page => normal 404
  assert.equal(resolveAdminRoute('/shop', SECRET).action, 'next');
});
test('admin: switched off when the secret is missing or too short', () => {
  assert.equal(resolveAdminRoute('/short/orders', 'short').action, 'next');
  assert.equal(resolveAdminRoute('/anything', undefined).action, 'next');
});

// ---- admin CSV export <-> importer stay in sync ----
import { PRODUCT_COLUMNS, productToRow, toCSV } from '../lib/csv.js';

test('exported product rows are accepted by the importer rules', () => {
  const dbRow = { sku: 'THS-9', name: 'Test, "Quoted" Serum', brand: 'GlowLab', categories: { name: 'Skincare' }, subcategory: 'Serums', price_ngn: 15000, old_price_ngn: 18000, stock: 7,
    short_description: 'Short', description: 'Long', ingredients: 'Aqua', how_to_use: 'Use', tags: ['a', 'b'], concerns: ['glow'], images: ['https://x.com/a.jpg', 'data:image/png;base64,AAA'], is_featured: true, is_best_seller: false, is_new: true };
  const row = productToRow(dbRow);
  assert.equal(row.length, PRODUCT_COLUMNS.length);
  const rec = Object.fromEntries(PRODUCT_COLUMNS.map((c, i) => [c, row[i]]));
  const v = validateProductRow(rec);
  assert.equal(v.ok, true);
  assert.deepEqual([v.value.sku, v.value.price_ngn, v.value.old_price_ngn, v.value.stock, v.value.is_featured, v.value.is_new], ['THS-9', 15000, 18000, 7, true, true]);
  assert.deepEqual(v.value.images, ['https://x.com/a.jpg']);       // data: images are not exported
  assert.deepEqual(v.value.concerns, ['glow']);
  assert.ok(toCSV(PRODUCT_COLUMNS, [row]).includes('"Test, ""Quoted"" Serum"'));   // commas and quotes survive
});
