import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseExpiredHolds } from '../lib/stock-hold.js';

function fakeDb({ due = [], fresh = {}, releaseOk = true, queryError = null }) {
  const rpcs = [];
  return {
    rpcs,
    from() { return { select() { return {
      eq(col, val) { return {
        or() { return { limit: async () => ({ data: queryError ? null : due, error: queryError }) }; },
        maybeSingle: async () => ({ data: fresh[val] || null, error: null }),
      }; },
    }; } }; },
    rpc: async (name, args) => { rpcs.push([name, args]); return { data: releaseOk, error: null }; },
  };
}
const HELD = { id: 'o1', paystack_reference: 'ths_1', status: 'pending', payment_status: 'unpaid' };
const STILL_HELD = { o1: { stock_held: true, payment_status: 'unpaid' } };
const verifyAs = (status) => async () => (status === null ? null : { status });
const noSettle = async () => {};

test('a cancelled order gives its held stock back at once', async () => {
  const db = fakeDb({ due: [{ id: 'o1', paystack_reference: 'ths_1', status: 'cancelled', payment_status: 'unpaid' }], fresh: STILL_HELD });
  assert.deepEqual(await releaseExpiredHolds(db, { verify: verifyAs('pending'), settle: noSettle }), { released: 1, kept: 0, failed: false });
  assert.deepEqual(db.rpcs[0], ['release_hold', { p_order: 'o1' }]);
});
test('an expired hold stays while Paystack says the payment may still come', async () => {
  const db = fakeDb({ due: [HELD], fresh: STILL_HELD });
  assert.deepEqual(await releaseExpiredHolds(db, { verify: verifyAs('pending'), settle: noSettle }), { released: 0, kept: 1, failed: false });
  assert.equal(db.rpcs.length, 0);
});
test('an expired hold is released when Paystack says failed, abandoned or reversed', async () => {
  for (const s of ['failed', 'abandoned', 'reversed']) {
    const db = fakeDb({ due: [HELD], fresh: STILL_HELD });
    assert.equal((await releaseExpiredHolds(db, { verify: verifyAs(s), settle: noSettle })).released, 1, s);
  }
});
test('no answer from Paystack keeps the hold: nothing is released on a guess', async () => {
  const db = fakeDb({ due: [HELD], fresh: STILL_HELD });
  assert.deepEqual(await releaseExpiredHolds(db, { verify: verifyAs(null), settle: noSettle }), { released: 0, kept: 1, failed: false });
  assert.equal(db.rpcs.length, 0);
});
test('an order paid in the meantime is not released', async () => {
  const db = fakeDb({ due: [HELD], fresh: { o1: { stock_held: false, payment_status: 'paid' } } });
  assert.deepEqual(await releaseExpiredHolds(db, { verify: verifyAs('failed'), settle: noSettle }), { released: 0, kept: 0, failed: false });
  assert.equal(db.rpcs.length, 0);
});
test('a release the database refuses is counted as not released, not as success', async () => {
  const db = fakeDb({ due: [HELD], fresh: STILL_HELD, releaseOk: false });
  assert.equal((await releaseExpiredHolds(db, { verify: verifyAs('failed'), settle: noSettle })).released, 0);
});
test('if the list of held orders cannot be read, nothing is touched', async () => {
  const db = fakeDb({ queryError: { message: 'down' } });
  assert.deepEqual(await releaseExpiredHolds(db, { verify: verifyAs('failed'), settle: noSettle }), { released: 0, kept: 0, failed: true });
  assert.equal(db.rpcs.length, 0);
});
