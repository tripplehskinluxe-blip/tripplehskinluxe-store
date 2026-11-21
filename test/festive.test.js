import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFestive, festiveBanner } from '../lib/festive.js';
import { SPEC, validate } from '../lib/settings-core.js';

test('festive looks: nothing shows when every switch is off, and the first switch that is on wins', () => {
  assert.equal(activeFestive({ christmas: false, newYear: false, eid: false, halloween: false }), null);
  assert.equal(activeFestive(undefined), null);
  assert.equal(activeFestive({ eid: true, halloween: true }), 'eid');
  assert.equal(activeFestive({ christmas: 'yes', halloween: true }), 'halloween', 'only a real true counts');
});

test('festive looks: the banner names the season and the shop', () => {
  assert.equal(festiveBanner('christmas', 'Tripple H Skin Luxe'), 'Merry Christmas from Tripple H Skin Luxe');
  assert.equal(festiveBanner('eid', ''), 'Eid Mubarak from us');
});

test('festive settings: a saved set of switches is accepted, and the admin can only save true or false', () => {
  assert.equal(validate(SPEC.festive, { christmas: true, newYear: false, eid: false, halloween: false }).ok, true);
  assert.equal(validate(SPEC.festive, { christmas: 'yes', newYear: false, eid: false, halloween: false }).ok, false);
});
