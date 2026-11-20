import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { handlePaystackWebhook } from '../lib/settlement.js';

mock.method(console, 'error', () => {});
const REF = 'ths_12345678-1234-1234-1234-123456789abc';
const ORDER = { order_number: 'ONL-2026-1001', total_ngn: 12000 };
function fakeDb({ notify = true, rpcError = null, storeEmail = 'owner@shop.test', known = true } = {}) {
  const calls = [];
  const storeRow = { value: { name: 'Shop', email: storeEmail } };
  return {
    calls,
    rpc: async (name, args) => { calls.push([name, args]); return rpcError ? { data: null, error: rpcError } : { data: { notify, known }, error: null }; },
    from: (t) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: t === 'settings' ? storeRow : ORDER, error: null }) }) }) }),
  };
}
const mail = (sent = [], configured = true, fail = false) => ({
  emailConfigured: () => configured,
  sendEmail: async (m) => { if (fail) throw new Error('resend down'); sent.push(m); },
});
const event = (type, data) => JSON.stringify({ event: type, data });
const hook = (raw, db, deps = {}) => handlePaystackWebhook({ raw, signature: 'x', secret: 's', db, deps: { verifySignature: () => true, ...deps } });

test('a new dispute flags the order and emails the admin once, without customer details', async () => {
  const sent = []; const db = fakeDb({ notify: true });
  const r = await hook(event('charge.dispute.create', { id: 77, status: 'pending', amount: 1200000, transaction: { reference: REF } }), db, { mail: mail(sent) });
  assert.deepEqual(r, { status: 200, body: 'ok' });
  assert.deepEqual(db.calls[0][1], { p_reference: REF, p_event: 'create', p_dispute_id: '77', p_status: 'pending', p_amount_kobo: 1200000 });
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'owner@shop.test');
  assert.match(sent[0].text, /ONL-2026-1001/); assert.doesNotMatch(sent[0].text, /@|customer/i);
  assert.match(sent[0].subject, /Dispute opened/);
});
test('the admin is emailed only once: a repeat notice does not send a second email', async () => {
  const sent = []; await hook(event('charge.dispute.create', { id: 77, transaction: { reference: REF } }), fakeDb({ notify: false }), { mail: mail(sent) });
  assert.equal(sent.length, 0);
});
test('reminders and resolutions update the order and never email', async () => {
  for (const type of ['charge.dispute.remind', 'charge.dispute.resolve']) {
    const sent = []; const db = fakeDb({ notify: false });
    const r = await hook(event(type, { id: 77, status: 'resolved', transaction: { reference: REF } }), db, { mail: mail(sent) });
    assert.equal(r.status, 200); assert.equal(sent.length, 0); assert.equal(db.calls[0][1].p_event, type.slice('charge.dispute.'.length));
  }
});
test('a dispute on a payment that is not ours is ignored and nothing changes', async () => {
  const db = fakeDb();
  const r = await hook(event('charge.dispute.create', { id: 1, transaction: { reference: 'someone-else-123' } }), db, { mail: mail() });
  assert.deepEqual(r, { status: 200, body: 'ignored' }); assert.equal(db.calls.length, 0);
});
test('if the database fails, Paystack is asked to send the notice again', async () => {
  const r = await hook(event('charge.dispute.create', { id: 1, transaction: { reference: REF } }), fakeDb({ rpcError: { message: 'db down' } }), { mail: mail() });
  assert.deepEqual(r, { status: 500, body: 'retry' });
});
test('an email failure never fails the webhook: the order is still flagged', async () => {
  const db = fakeDb({ notify: true });
  const r = await hook(event('charge.dispute.create', { id: 1, transaction: { reference: REF } }), db, { mail: mail([], true, true) });
  assert.deepEqual(r, { status: 200, body: 'ok' }); assert.equal(db.calls[0][0], 'dispute_event');
});
test('no valid store email saved: the order is still flagged, and nothing is sent anywhere else', async () => {
  for (const bad of ['', '   ', 'not-an-email']) {
    const sent = []; const db = fakeDb({ notify: true, storeEmail: bad });
    const r = await hook(event('charge.dispute.create', { id: 1, transaction: { reference: REF } }), db, { mail: mail(sent) });
    assert.deepEqual(r, { status: 200, body: 'ok' }); assert.equal(sent.length, 0, `for "${bad}"`);
  }
});
