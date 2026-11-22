import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSettings } from '../lib/settings-core.js';

test('with nothing saved, the store contact email is the store\'s own address', () => {
  assert.equal(buildSettings([]).store.email, 'tripplehskinluxe@gmail.com');
});
test('the template address never appears anywhere in the shop code', () => {
  const files = ['app', 'lib', 'components', 'content'].flatMap((d) => fs.readdirSync(d, { recursive: true }).filter((f) => /\.(js|mjs|css)$/.test(String(f))).map((f) => `${d}/${f}`));
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /lumebeauty/i, f);
});
