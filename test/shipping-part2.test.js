import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShipping, chooseShipping, LAGOS_LGAS } from '../lib/shipping-core.js';
import { mapShippingRows } from '../lib/shipping-data.js';
import { calcTotals } from '../lib/pricing.js';

const DELIVERY = { lagosFee: 3500, otherFee: 5000, freeThreshold: 50000, lagosDays: '1 to 3', otherDays: '3 to 5', returnDays: 7 };
const data = {
  zones: [
    { id: 'z-main', name: 'Lagos Mainland', kind: 'zone', fee_ngn: 3500, active: true },
    { id: 'z-int', name: 'Inter-state', kind: 'interstate', fee_ngn: 5000, active: true },
  ],
  lgas: [{ name: 'Ojo', zone_id: 'z-main' }, { name: 'Lagos Mainland', zone_id: 'z-main' }],
  areas: [{ id: 'a-imude', lga: 'Ojo', name: 'Imude', aliases: ['Imude-Shibiri'], zone_id: null, fee_ngn: null, active: true }],
  cities: [{ id: 'c-abuja', state: 'FCT - Abuja', city: 'Abuja', fee_ngn: 15000, active: true }],
  lgaNames: ['Ojo', 'Lagos Mainland'],
};
const BUMPA = 'no.42, Adigun street , baba qudus b/stop , imude , lagos';

test('the list of 20 Lagos local governments is complete', () => {
  assert.equal(LAGOS_LGAS.length, 20);
  assert.ok(LAGOS_LGAS.includes('Eti-Osa') && LAGOS_LGAS.includes('Ojo'));
});
test('the server only accepts an option it offered for that address', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Ojo', address: BUMPA });
  assert.equal(chooseShipping(r, 'area:a-imude', 'Lagos').ok, true);
  assert.equal(chooseShipping(r, 'lga:Lagos Mainland', 'Lagos').code, 'SHIPPING_NOT_OFFERED', 'a made-up or other option is refused');
  assert.equal(chooseShipping(r, '', 'Lagos').code, 'SHIPPING_NOT_OFFERED');
});
test('a mismatch is refused and names the correct local government', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Lagos Mainland', address: BUMPA });
  const c = chooseShipping(r, 'area:a-imude', 'Lagos');
  assert.equal(c.ok, false);
  assert.equal(c.code, 'SHIPPING_MISMATCH');
  assert.equal(c.correct_lga, 'Ojo');
});
test('an unpriced option can never be charged', () => {
  const noPrice = { ...data, zones: data.zones.map((z) => (z.id === 'z-main' ? { ...z, fee_ngn: null } : z)) };
  const r = resolveShipping(noPrice, { state: 'Lagos', lga: 'Ojo', address: 'street' });
  assert.equal(chooseShipping(r, 'lga:Ojo', 'Lagos').code, 'SHIPPING_UNPRICED');
});
test('the free-delivery threshold applies only to Lagos local government and area options', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Ojo', address: BUMPA });
  assert.equal(chooseShipping(r, 'area:a-imude', 'Lagos').freeEligible, true);
  const ab = resolveShipping(data, { state: 'FCT - Abuja', address: 'Garki, Abuja' });
  assert.equal(chooseShipping(ab, 'city:c-abuja', 'FCT - Abuja').freeEligible, false);
  assert.equal(chooseShipping(ab, 'city:c-abuja', 'FCT - Abuja').fee, 15000);
});
test('the server total uses the chosen zone fee, and the free threshold only where eligible', () => {
  const items = [{ price: 40000, qty: 1 }];
  const over = calcTotals({ items, state: 'Lagos', settings: DELIVERY, shipping: { fee: 3500, freeEligible: true } });
  assert.equal(over.delivery, 3500, 'under the threshold it pays the zone fee');
  const big = calcTotals({ items: [{ price: 60000, qty: 1 }], state: 'Lagos', settings: DELIVERY, shipping: { fee: 3500, freeEligible: true } });
  assert.equal(big.delivery, 0, 'over the threshold and eligible, it is free as before');
  const abuja = calcTotals({ items: [{ price: 60000, qty: 1 }], state: 'FCT - Abuja', settings: DELIVERY, shipping: { fee: 15000, freeEligible: false } });
  assert.equal(abuja.delivery, 15000, 'outside Lagos it is never free');
});
test('with no shipping option, the total is exactly as before (existing behaviour kept)', () => {
  assert.equal(calcTotals({ items: [{ price: 1000, qty: 1 }], state: 'Lagos', settings: DELIVERY }).delivery, 3500);
  assert.equal(calcTotals({ items: [{ price: 1000, qty: 1 }], state: 'Kano', settings: DELIVERY }).delivery, 5000);
  assert.equal(calcTotals({ items: [{ price: 1000, qty: 1 }], state: 'Lagos', method: 'pickup', settings: DELIVERY, shipping: { fee: 3500, freeEligible: true } }).delivery, 0);
});
test('blank zone prices fall back to the Settings fees, so nothing is blocked', () => {
  const rows = mapShippingRows({
    zones: [{ id: 'z1', name: 'Lagos Mainland', kind: 'zone', fee_ngn: null, active: true }, { id: 'z2', name: 'Inter-state', kind: 'interstate', fee_ngn: null, active: true }],
    lgas: [{ name: 'Ojo', zone_id: 'z1' }], areas: [], cities: [{ id: 'c1', state: 'FCT - Abuja', city: 'Abuja', fee_ngn: null, active: true }],
  }, DELIVERY);
  assert.equal(rows.zones.find((z) => z.name === 'Lagos Mainland').fee_ngn, 3500);
  assert.equal(rows.zones.find((z) => z.name === 'Inter-state').fee_ngn, 5000);
  assert.equal(rows.cities[0].fee_ngn, 5000);
  const r = resolveShipping({ ...rows, lgaNames: ['Ojo'] }, { state: 'FCT - Abuja', address: 'Abuja' });
  assert.equal(r.ok, true, 'an unpriced Abuja city still gives a payable option');
});
