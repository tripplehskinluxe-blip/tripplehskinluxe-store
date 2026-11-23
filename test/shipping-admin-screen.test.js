import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the delivery zones screen is admin only and uses only the admin functions (no direct table access)', () => {
  const src = fs.readFileSync('app/internal-admin/shipping/page.js', 'utf8');
  assert.match(src, /<AdminOnly>/);
  assert.doesNotMatch(src, /\.from\(['"]shipping_/, 'the screen must go through the database functions');
  for (const fn of ['shipping_admin_snapshot', 'shipping_save_zone', 'shipping_save_lga', 'shipping_save_area', 'shipping_delete_area', 'shipping_save_city', 'shipping_delete_city']) {
    assert.match(src, new RegExp(fn), fn);
  }
});
test('the cart no longer shows a second delivery price', () => {
  const src = fs.readFileSync('app/(store)/cart/page.js', 'utf8');
  assert.match(src, /Calculated at checkout/);
  assert.doesNotMatch(src, /naira\(t\.delivery\)/, 'the cart must not show a delivery fee estimate');
});
test('the admin menu links to the delivery zones screen', () => {
  assert.match(fs.readFileSync('components/admin/AdminProvider.js', 'utf8'), /\/shipping/);
});
