import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, SETTING_KEYS, DEFAULT_SETTINGS, buildSettings, loadSettings, sanitize, validate, tokenValues, fillTokens, announcement, waLink } from '../lib/settings-core.js';
import { calcTotals } from '../lib/pricing.js';

const D = DEFAULT_SETTINGS;
const row = (key, value) => ({ key, value });

test('settings: every starting value passes the strict checks (an untouched form can always be saved)', () => {
  for (const k of SETTING_KEYS) { const r = sanitize(k, D[k]); assert.equal(r.ok, true, `${k}: ${r.error}`); }
});

test('settings: with nothing saved the shop uses the starting values', () => {
  const s = buildSettings([]); assert.deepEqual(s, buildSettings(undefined)); assert.equal(s.delivery.lagosFee, 2000);
});

test('settings: saved values win, per field, over the starting values', () => {
  const s = buildSettings([row('delivery', { ...D.delivery, lagosFee: 2500 }), row('store', { ...D.store, name: 'Glow House' })]);
  assert.equal(s.delivery.lagosFee, 2500); assert.equal(s.store.name, 'Glow House'); assert.equal(s.delivery.otherFee, 4500);
});

test('settings: damaged saved data never breaks the shop (falls back field by field)', () => {
  const s = buildSettings([row('delivery', { lagosFee: 'free!!', otherFee: -5, freeThreshold: 70000, lagosDays: 12 }), row('store', 'garbage'), row('faq', { items: 'nope' }), row('spa', null)]);
  assert.equal(s.delivery.lagosFee, 2000); assert.equal(s.delivery.otherFee, 4500); assert.equal(s.delivery.freeThreshold, 70000); assert.equal(s.delivery.lagosDays, '1–3 working days');
  assert.equal(s.store.name, D.store.name); assert.deepEqual(s.faq.items, D.faq.items); assert.equal(s.spa.headline, D.spa.headline);
});

test('settings: an admin can deliberately empty a list (e.g. remove every FAQ)', () => {
  assert.deepEqual(buildSettings([row('faq', { items: [] })]).faq.items, []);
});

test('settings: strict save refuses bad numbers, links, emails and over-long text', () => {
  const del = (o) => sanitize('delivery', { ...D.delivery, ...o });
  assert.equal(del({ lagosFee: -1 }).ok, false); assert.equal(del({ lagosFee: 1.5 }).ok, false); assert.equal(del({ lagosFee: 'abc' }).ok, false);
  assert.equal(del({ lagosFee: 99999999 }).ok, false); assert.equal(del({ returnDays: 0 }).ok, false); assert.equal(del({ lagosDays: '' }).ok, false);
  assert.equal(del({ lagosFee: '2500' }).value.lagosFee, 2500);              // numbers typed in a form arrive as text and are accepted
  const st = (o) => sanitize('store', { ...D.store, ...o });
  assert.equal(st({ email: 'nope' }).ok, false); assert.equal(st({ whatsapp: '0801' }).ok, false); assert.equal(st({ name: '' }).ok, false);
  assert.equal(st({ name: 'x'.repeat(61) }).ok, false); assert.equal(st({ social: { ...D.store.social, instagram: 'http://insecure.com' } }).ok, false);
  assert.equal(st({ social: { ...D.store.social, instagram: 'javascript:alert(1)' } }).ok, false);
  assert.equal(st({ whatsapp: '+234 801 234 5678' }).value.whatsapp, '2348012345678');
  assert.match(st({ name: 'bad\u0000name' }).error, /not allowed/);
});

test('settings: unknown keys are dropped, wrong shapes refused, unknown setting names refused', () => {
  assert.equal('evil' in sanitize('delivery', { ...D.delivery, evil: 1 }).value, false);
  assert.equal(sanitize('delivery', [1, 2]).ok, false); assert.equal(sanitize('delivery', null).ok, false); assert.equal(sanitize('passwords', {}).ok, false);
  assert.equal(sanitize('faq', { items: Array.from({ length: 41 }, () => ({ q: 'a', a: 'b' })) }).ok, false);
});

test('settings: spa price is optional (empty = "ask for pricing") and must be a whole number when given', () => {
  const sp = (from) => sanitize('spa', { ...D.spa, services: [{ name: 'Facial', duration: '60 min', from, description: 'x' }] });
  assert.equal(sp(null).value.services[0].from, null); assert.equal(sp('').value.services[0].from, null); assert.equal(sp(15000).value.services[0].from, 15000);
  assert.equal(sp(-5).ok, false); assert.equal(sp(1.5).ok, false);
});

test('settings: CEO photo must be https on an allowed host or a local file; other websites are refused', () => {
  const ceo = (photo, ctx) => sanitize('ceo', { ...D.ceo, photo }, ctx);
  const ctx = { imageHosts: ['res.cloudinary.com', 'abcd.supabase.co'] };
  assert.equal(ceo('https://abcd.supabase.co/storage/v1/object/public/products/site/a.jpg', ctx).ok, true);
  assert.equal(ceo('/ceo.jpg', ctx).ok, true); assert.equal(ceo('', ctx).ok, true);
  assert.equal(ceo('https://evil.example.com/a.jpg', ctx).ok, false); assert.equal(ceo('http://abcd.supabase.co/a.jpg', ctx).ok, false);
  assert.equal(ceo('//evil.com/a.jpg', ctx).ok, false); assert.equal(ceo('/../secret.jpg', ctx).ok, false); assert.equal(ceo('/ok/path.jpg', ctx).ok, true);
});

test('settings: tokens fill from the SAVED values; unknown tokens and inherited keys are left alone', () => {
  const s = buildSettings([row('delivery', { ...D.delivery, otherFee: 5000, returnDays: 14 })]);
  assert.equal(fillTokens('Flat {{otherFee}}, {{returnDays}} days, {{constructor}} {{nope}}', tokenValues(s)), 'Flat ₦5,000, 14 days, {{constructor}} {{nope}}');
});

test('settings: the announcement bar follows the free-delivery amount automatically, and can be switched off', () => {
  assert.equal(announcement(buildSettings([])), 'Free delivery on orders over ₦50,000 in Lagos');
  assert.equal(announcement(buildSettings([row('delivery', { ...D.delivery, freeThreshold: 80000 })])), 'Free delivery on orders over ₦80,000 in Lagos');
  assert.equal(announcement(buildSettings([row('store', { ...D.store, announceOn: false })])), '');
  assert.equal(announcement(buildSettings([row('store', { ...D.store, announce: '' })])), '');
});

test('settings: WhatsApp links use the saved number and shop name', () => {
  const s = buildSettings([row('store', { ...D.store, whatsapp: '2348012345678', name: 'Glow House' })]);
  assert.match(waLink(s, 'Hi'), /^https:\/\/wa\.me\/2348012345678\?text=Hi$/); assert.match(decodeURIComponent(waLink(s)), /Hello Glow House/);
  assert.match(waLink(s, 'x', '+234 9 0000'), /wa\.me\/23490000\?/);
});

test('settings: loadSettings reads through any client, and a database error is reported (so the caller can fail closed)', async () => {
  const ok = { from: () => ({ select: async () => ({ data: [row('delivery', { ...D.delivery, lagosFee: 3000 })], error: null }) }) };
  assert.equal((await loadSettings(ok)).delivery.lagosFee, 3000);
  const down = { from: () => ({ select: async () => ({ data: null, error: { message: 'x' } }) }) };
  await assert.rejects(() => loadSettings(down), /could not be loaded/);
  assert.equal((await loadSettings(null)).delivery.lagosFee, 2000);
});

test('pricing: fees and the free-delivery line come ONLY from the settings passed in', () => {
  const items = [{ price: 40000, qty: 1 }];
  const t = (settings, state = 'Lagos') => calcTotals({ items, state, settings });
  assert.equal(t({ lagosFee: 2500, otherFee: 6000, freeThreshold: 50000 }).delivery, 2500);
  assert.equal(t({ lagosFee: 2500, otherFee: 6000, freeThreshold: 30000 }).delivery, 0);
  assert.equal(t({ lagosFee: 2500, otherFee: 6000, freeThreshold: 30000 }, 'Rivers').delivery, 6000);
  assert.equal(t({ lagosFee: 0, otherFee: 0, freeThreshold: 1 }, 'Rivers').total, 40000);
  assert.throws(() => calcTotals({ items }), /delivery settings are required/);
  assert.throws(() => calcTotals({ items, settings: {} }), /delivery settings are required/);
  assert.throws(() => calcTotals({ items, settings: { lagosFee: '2000', otherFee: 1, freeThreshold: 1 } }), /required/);
});

test('settings: the form description and the checks are one thing (every field has a label)', () => {
  const walk = (spec, path) => { assert.ok(spec.label, `no label at ${path}`); if (spec.t === 'obj') Object.entries(spec.fields).forEach(([k, f]) => walk(f, `${path}.${k}`)); if (spec.t === 'list') walk(spec.item, `${path}[]`); };
  SETTING_KEYS.forEach((k) => walk(SPEC[k], k));
  assert.equal(validate(SPEC.store.fields.name, 'ok').ok, true);
});
