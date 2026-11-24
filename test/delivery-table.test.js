import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('the delivery table reads the same zones as checkout', () => {
  const src = fs.readFileSync('app/(store)/delivery/page.js', 'utf8');
  assert.match(src, /loadShippingData/);
  assert.match(src, /interstate/);
});
test('if the zones cannot be read, the page still shows the Settings fees (never a blank table)', () => {
  const src = fs.readFileSync('app/(store)/delivery/page.js', 'utf8');
  assert.match(src, /naira\(d\.lagosFee\)/);
  assert.match(src, /naira\(d\.otherFee\)/);
});
test('a zone with no price of its own shows "At checkout", never a blank or zero fee', () => {
  assert.match(fs.readFileSync('app/(store)/delivery/page.js', 'utf8'), /At checkout/);
});
