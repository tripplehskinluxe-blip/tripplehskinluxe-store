import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('every admin menu item has an icon that exists', () => {
  const icons = fs.readFileSync('components/icons.js', 'utf8');
  const nav = fs.readFileSync('components/admin/AdminProvider.js', 'utf8').split('\n').find((l) => l.startsWith('const NAV = ['));
  const names = [...nav.matchAll(/\['[^']*', '[^']*', '([a-z]+)'/g)].map((m) => m[1]);
  assert.equal(names.length, 16);
  for (const n of names) assert.ok(icons.includes(n + ':'), 'missing icon: ' + n);
});
test('the menu icons match their sections', () => {
  const nav = fs.readFileSync('components/admin/AdminProvider.js', 'utf8');
  for (const [label, icon] of [['Refunds','cash'],['Audit log','clock'],['Settings','sliders'],['Legal pages','doc'],['Delivery zones','truck'],['Analytics','chart']]) {
    assert.match(nav, new RegExp("'" + label + "', '" + icon + "'"), label);
  }
});
