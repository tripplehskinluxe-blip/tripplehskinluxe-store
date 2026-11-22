import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSettings } from '../lib/settings-core.js';

const all = () => ['app', 'lib', 'components', 'content'].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d, { recursive: true }).filter((f) => /\.(js|mjs|css)$/.test(String(f))).map((f) => `${d}/${f}`));

test('no page loads fonts or anything else from Google', () => {
  for (const f of all()) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /next\/font\/google|fonts\.googleapis|fonts\.gstatic/, f);
});
test('the store\'s own fonts are the ones the pages use', () => {
  const layout = fs.readFileSync('app/layout.js', 'utf8');
  assert.match(layout, /@fontsource-variable\/fraunces/); assert.match(layout, /@fontsource-variable\/figtree/); assert.match(layout, /cormorant-garamond\/700-italic/);
});
test('the contact details with nothing saved are the real ones, not the template values', () => {
  const s = buildSettings([]).store;
  assert.equal(s.whatsapp, '2348185775887');
  assert.doesNotMatch(s.address, /Admiralty/);
  assert.doesNotMatch(s.whatsapp, /^2348000000000$/);
});
