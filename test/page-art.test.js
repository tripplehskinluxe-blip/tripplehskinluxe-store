import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(f, 'utf8');
test('all six pieces of artwork are in place', () => {
  for (const n of ['terms','returns','privacy','bag','checkout','delivery']) assert.ok(fs.existsSync(`public/icons/${n}.png`), n);
});
test('the cart has a clear-bag button that asks first', () => {
  const src = read('app/(store)/cart/page.js');
  assert.match(src, /Clear bag/);
  assert.match(src, /window\.confirm\('Clear everything from your bag\?'\)/);
});
test('checkout no longer explains Paystack on the payment step', () => {
  const src = read('app/(store)/checkout/page.js');
  assert.doesNotMatch(src, /We never see your card details/);
  assert.doesNotMatch(src, /You&apos;ll be redirected to Paystack/);
});
test('the cart on checkout and the truck on delivery drive across in a loop (and stop for reduced motion)', () => {
  assert.match(read('app/(store)/checkout/page.js'), /pg-track/);
  assert.match(read('app/(store)/delivery/page.js'), /pg-track/);
  const css = read('app/globals.css');
  assert.match(css, /@keyframes pgdrive/);
  assert.match(css, /prefers-reduced-motion/);
});
test('the legal pages show their own artwork', () => {
  for (const [p, i] of [['terms','terms'],['returns','returns'],['privacy','privacy']]) assert.match(read(`app/(store)/${p}/page.js`), new RegExp(`/icons/${i}\\.png`));
});
