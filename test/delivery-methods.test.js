import test from 'node:test';
import assert from 'node:assert/strict';
import { calcTotals } from '../lib/pricing.js';
import { otherStatesFor } from '../lib/ng-areas.js';
import { confirmationEmail, statusEmail } from '../lib/email.js';
import { buildSettings } from '../lib/settings-core.js';

const SETTINGS = buildSettings([]);
const ITEMS = [{ product_id: 'p1', price_ngn: 10000, qty: 1, name: 'Serum' }];
const BASE = { order_number: 'ONL-2026-1002', customer_name: 'Ada', customer_email: 'ada@example.com', subtotal_ngn: 10000, delivery_ngn: 0, discount_ngn: 0, total_ngn: 10000, address: { pickup: true, address: 'Shop 1, Yaba' } };

test('store pickup is always free, even outside Lagos and below the free-delivery limit', () => {
  const lines = [{ id: 'p1', price: 5000, qty: 1, stock: 5 }];
  for (const state of ['Lagos', 'Kano', 'Other']) {
    assert.equal(calcTotals({ items: lines, state, method: 'pickup', settings: SETTINGS.delivery }).delivery, 0, state);
  }
  assert.ok(calcTotals({ items: lines, state: 'Kano', method: 'delivery', settings: SETTINGS.delivery }).delivery > 0);
});

test('a city that belongs to another state is flagged; unknown or matching places are not', () => {
  assert.deepEqual(otherStatesFor('Lagos', 'Kano'), ['Kano']);
  assert.deepEqual(otherStatesFor('Lagos', ' yaba '), []);
  assert.deepEqual(otherStatesFor('Lagos', 'Okokomaiko'), []);
  assert.deepEqual(otherStatesFor('Kano', ''), []);
  assert.ok(otherStatesFor('Lagos', 'Ota').includes('Ogun'));
});

test('confirmation email for pickup says where to collect, not a delivery address', () => {
  const m = confirmationEmail({ ...BASE, delivery_method: 'pickup' }, [{ name: 'Serum', qty: 1, unit_price_ngn: 10000 }], SETTINGS);
  assert.match(m.html, /Collect from/); assert.match(m.html, /within 48 hours/); assert.doesNotMatch(m.html, /Delivering to/);
  assert.match(m.text, /Collect from/); assert.doesNotMatch(m.text, /Delivering to/);
  const d = confirmationEmail({ ...BASE, delivery_method: 'delivery', delivery_ngn: 2000, total_ngn: 12000, address: { address: '1 St', city: 'Yaba', state: 'Lagos' } }, [{ name: 'Serum', qty: 1, unit_price_ngn: 10000 }], SETTINGS);
  assert.match(d.html, /Delivering to/);
});

test('ready-for-pickup email carries the pickup code and the shop address, once escaped', () => {
  const m = statusEmail({ ...BASE, status: 'ready_for_pickup', delivery_method: 'pickup', pickup_code: 'A3F9C2' }, SETTINGS);
  assert.match(m.subject, /ready for pickup/i); assert.match(m.html, /A3F9C2/); assert.match(m.html, /Collect from/); assert.match(m.text, /A3F9C2/);
  const evil = statusEmail({ ...BASE, status: 'ready_for_pickup', delivery_method: 'pickup', pickup_code: '<b>x</b>' }, SETTINGS);
  assert.doesNotMatch(evil.html, /<b>x<\/b>/);
});

test('the wording always matches how the order leaves the shop', () => {
  assert.equal(statusEmail({ ...BASE, status: 'shipped', delivery_method: 'pickup' }, SETTINGS), null);
  assert.equal(statusEmail({ ...BASE, status: 'out_for_delivery', delivery_method: 'pickup' }, SETTINGS), null);
  assert.equal(statusEmail({ ...BASE, status: 'ready_for_pickup', delivery_method: 'delivery' }, SETTINGS), null);
  assert.match(statusEmail({ ...BASE, status: 'delivered', delivery_method: 'pickup' }, SETTINGS).subject, /collecting/i);
  assert.match(statusEmail({ ...BASE, status: 'delivered', delivery_method: 'delivery' }, SETTINGS).subject, /delivered/i);
});
