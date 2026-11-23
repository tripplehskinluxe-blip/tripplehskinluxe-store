import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShipping, phraseIn } from '../lib/shipping-core.js';

const data = {
  zones: [
    { id: 'z-main', name: 'Lagos Mainland', kind: 'zone', fee_ngn: 3500, active: true },
    { id: 'z-yaba', name: 'Yaba', kind: 'zone', fee_ngn: 2000, active: true },
    { id: 'z-isl', name: 'Lagos Island', kind: 'zone', fee_ngn: 4500, active: true },
    { id: 'z-int', name: 'Inter-state', kind: 'interstate', fee_ngn: null, active: true },
  ],
  lgas: [
    { name: 'Ojo', zone_id: 'z-main' }, { name: 'Lagos Mainland', zone_id: 'z-main' },
    { name: 'Eti-Osa', zone_id: 'z-isl' }, { name: 'Ikeja', zone_id: 'z-main' },
  ],
  areas: [
    { id: 'a-imude', lga: 'Ojo', name: 'Imude', aliases: ['Imude-Shibiri'], zone_id: null, fee_ngn: null, active: true },
    { id: 'a-ojotown', lga: 'Ojo', name: 'Ojo town', aliases: [], zone_id: null, fee_ngn: null, active: true },
    { id: 'a-yaba', lga: 'Lagos Mainland', name: 'Yaba', aliases: [], zone_id: 'z-yaba', fee_ngn: null, active: true },
    { id: 'a-iba', lga: 'Ojo', name: 'Iba', aliases: [], zone_id: null, fee_ngn: null, active: true },
  ],
  cities: [{ id: 'c-abuja', state: 'FCT - Abuja', city: 'Abuja', fee_ngn: 15000, active: true }],
  lgaNames: ['Ojo', 'Lagos Mainland', 'Eti-Osa', 'Ikeja'],
};
const BUMPA = 'no.42, Adigun street , baba qudus b/stop , imude , lagos';

test('whole words only: "iba" does not match "Ibadan"', () => {
  assert.equal(phraseIn('Ibadan road', 'Iba'), false);
  assert.equal(phraseIn('Iba road', 'Iba'), true);
  assert.equal(phraseIn('Imude-Shibiri, Ojo', 'Imude-Shibiri'), true);
});
test('the Bumpa example: Ojo + Imude recommends Imude and still offers the Ojo standard option', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Ojo', address: BUMPA });
  assert.equal(r.ok, true);
  assert.equal(r.recommended, 'area:a-imude');
  assert.deepEqual(r.options.map((o) => o.id), ['area:a-imude', 'lga:Ojo']);
  assert.equal(r.options[0].fee, 3500, 'no area fee set, so it uses its local government zone price');
});
test('an address with no specific area: only the local government standard is offered, and it is flagged as unknown', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Ojo', address: 'Some street, near the market' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.options.map((o) => o.id), ['lga:Ojo']);
  assert.equal(r.recommended, 'lga:Ojo');
  assert.ok(r.flags.includes('unknown_area'));
});
test('mismatch: Lagos Mainland chosen but the address names Imude, which is only in Ojo: checkout stops and names Ojo', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Lagos Mainland', address: BUMPA });
  assert.equal(r.ok, false);
  assert.deepEqual(r.mismatch, { chosen_lga: 'Lagos Mainland', correct_lga: 'Ojo', area: 'Imude' });
});
test('mismatch never blocks an area listed under two local governments', () => {
  const amb = { ...data, areas: [...data.areas, { id: 'a-yaba-ikeja', lga: 'Ikeja', name: 'Yaba', aliases: [], zone_id: null, fee_ngn: null, active: true }] };
  const r = resolveShipping(amb, { state: 'Lagos', lga: 'Ojo', address: 'Yaba, Ojo' });
  assert.equal(r.ok, true);
  assert.equal(r.mismatch, null);
  assert.ok(r.flags.includes('ambiguous_area'));
});
test('a specific area with its own zone uses that zone price, not the local government price', () => {
  const r = resolveShipping(data, { state: 'Lagos', lga: 'Lagos Mainland', address: 'Yaba bus stop' });
  assert.equal(r.recommended, 'area:a-yaba');
  assert.equal(r.options[0].fee, 2000);
  assert.equal(r.options[0].zone, 'Yaba');
});
test('an unpriced zone is shown as not priced, so it can never be charged as free', () => {
  const noPrice = { ...data, zones: data.zones.map((z) => (z.id === 'z-main' ? { ...z, fee_ngn: null } : z)) };
  const r = resolveShipping(noPrice, { state: 'Lagos', lga: 'Ojo', address: 'Some street' });
  assert.equal(r.options[0].priced, false);
  assert.equal(r.options[0].fee, null);
});
test('an inactive zone is not offered as a price', () => {
  const off = { ...data, zones: data.zones.map((z) => (z.id === 'z-main' ? { ...z, active: false } : z)) };
  const r = resolveShipping(off, { state: 'Lagos', lga: 'Ojo', address: 'Some street' });
  assert.equal(r.options[0].priced, false);
});
test('an unknown local government is refused', () => {
  assert.equal(resolveShipping(data, { state: 'Lagos', lga: 'Nowhere', address: 'x' }).reason, 'invalid_lga');
});
test('outside Lagos: an Abuja address uses the Abuja city rate; others use the flat inter-state rate', () => {
  const abuja = resolveShipping(data, { state: 'FCT - Abuja', address: 'Plot 5, Garki, Abuja' });
  assert.equal(abuja.recommended, 'city:c-abuja');
  assert.equal(abuja.options[0].fee, 15000);
  const other = resolveShipping(data, { state: 'Kano', address: 'Plot 5, Kano' });
  assert.equal(other.recommended, 'interstate');
  assert.equal(other.options[0].priced, false, 'the flat rate is blank until the admin sets it');
});
test('an address with no state is refused', () => {
  assert.equal(resolveShipping(data, { state: '', lga: 'Ojo', address: 'x' }).ok, false);
});
