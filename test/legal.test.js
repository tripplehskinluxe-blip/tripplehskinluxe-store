import test from 'node:test';
import assert from 'node:assert/strict';
import { fillTokens, parseBlocks, tokenValues } from '../lib/legal.js';
import { buildSettings } from '../lib/settings-core.js';
import { LEGAL_DEFAULTS, LEGAL_SLUGS } from '../content/legal.js';
import { allowedImageHosts, validateProductRow } from '../lib/rows.js';
import { labelOf } from '../lib/format.js';

test('legal: tokens are filled, unknown tokens and inherited keys are left alone', () => {
  assert.equal(fillTokens('Hi {{name}}', { name: 'Shop' }), 'Hi Shop');
  assert.equal(fillTokens('{{nope}} {{constructor}} {{toString}}', { name: 'x' }), '{{nope}} {{constructor}} {{toString}}');
});

test('legal: markup becomes blocks and is never treated as HTML', () => {
  const b = parseBlocks('# Title\n\nHello <script>alert(1)</script>\nsecond line\n\n- a\n- b\n\n## Sub\ntext');
  assert.deepEqual(b.map((x) => x.t), ['h2', 'p', 'ul', 'h3', 'p']);
  assert.equal(b[1].text, 'Hello <script>alert(1)</script>\nsecond line');   // kept as plain text; React escapes it when rendering
  assert.deepEqual(b[2].items, ['a', 'b']);
  assert.deepEqual(parseBlocks('   \n\n'), []);
});

test('legal: every built-in page exists, has content, and no token is left unfilled', () => {
  assert.deepEqual(LEGAL_SLUGS, ['privacy', 'terms', 'returns']);
  for (const s of LEGAL_SLUGS) {
    const out = fillTokens(LEGAL_DEFAULTS[s].body, tokenValues(buildSettings([])));
    assert.ok(LEGAL_DEFAULTS[s].title && out.length > 300, s);
    assert.ok(!/\{\{/.test(out), `unfilled token in ${s}`);
  }
});

test('legal: return window and delivery times follow the saved settings (nothing typed in)', () => {
  const body = LEGAL_DEFAULTS.returns.body;
  assert.match(body, /\{\{returnDays\}\}/); assert.match(body, /replace/); assert.ok(!/\b7 days\b/.test(body));
  const changed = buildSettings([{ key: 'delivery', value: { ...buildSettings([]).delivery, returnDays: 14, lagosDays: '2 working days' } }]);
  assert.match(fillTokens(body, tokenValues(changed)), /within 14 days/);
  assert.match(fillTokens(LEGAL_DEFAULTS.terms.body, tokenValues(changed)), /2 working days/);
});

test('image hosts: only the shop\'s own storage and Cloudinary pass the importer', () => {
  const hosts = allowedImageHosts('https://abcd.supabase.co');
  const row = (u) => ({ sku: 'T-1', name: 'A', brand: 'B', category: 'Skincare', price: 1000, stock: 1, image_urls: u });
  const ok = validateProductRow(row('https://abcd.supabase.co/storage/v1/object/public/products/a.jpg|https://res.cloudinary.com/x/a.jpg'), { imageHosts: hosts });
  assert.equal(ok.ok, true); assert.equal(ok.value.images.length, 2); assert.equal(ok.warnings.length, 0);
  const bad = validateProductRow(row('https://evil.example.com/a.jpg|https://abcd.supabase.co.evil.com/a.jpg'), { imageHosts: hosts });
  assert.equal(bad.value.images.length, 0); assert.equal(bad.warnings.length, 2);
  assert.equal(validateProductRow(row('https://anywhere.com/a.jpg')).value.images.length, 1);   // no host rule given -> unchanged behaviour
});

test('labelOf: inherited object keys are never returned as labels', () => {
  const m = { acne: 'Acne' };
  assert.equal(labelOf(m, 'acne'), 'Acne'); assert.equal(labelOf(m, 'constructor'), 'constructor'); assert.equal(labelOf(m, '__proto__'), '__proto__');
});
