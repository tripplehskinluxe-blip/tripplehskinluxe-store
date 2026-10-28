import test from 'node:test';
import assert from 'node:assert/strict';
import { STATES, AREAS, areasFor } from '../lib/ng-areas.js';

test('every delivery state has a clean list of suggested areas', () => {
  assert.deepEqual(Object.keys(AREAS).sort(), [...STATES].sort());
  for (const s of STATES) {
    const list = areasFor(s);
    assert.ok(list.length >= 5, `${s} has too few areas`);
    assert.equal(new Set(list).size, list.length, `${s} has duplicate areas`);
    for (const a of list) assert.ok(a && a === a.trim() && !/[<>]/.test(a), `${s}: bad area "${a}"`);
  }
  assert.deepEqual(areasFor('Not a state'), []);
});

test('Lagos has the main mainland and island areas', () => {
  for (const a of ['Yaba', 'Ikeja', 'Surulere', 'Lekki', 'Victoria Island', 'Ikorodu']) assert.ok(areasFor('Lagos').includes(a), a);
});
