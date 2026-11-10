import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { sendConfirmationOnce } from '../lib/settlement.js';

mock.method(console, 'error', () => {});
const REF = 'ths_12345678-1234-1234-1234-123456789abc';
const ITEMS = [{ name: 'Serum', qty: 1, unit_price_ngn: 10000 }];
const mkOrder = (name = 'Ada Obi') => ({ id: 'o1', order_number: 'ONL-2026-1001', customer_name: name, customer_email: 'ada@example.com', address: { address: '1 St', city: 'Yaba', state: 'Lagos' }, subtotal_ngn: 10000, delivery_ngn: 2000, discount_ngn: 0, discount_code: null, total_ngn: 12000, status: 'processing', delivery_method: 'delivery' });
function fakeDb({ claim = { id: 'o1' }, order = mkOrder() } = {}) {
  const calls = [];
  return { calls,
    rpc: async (name, args) => { calls.push([name, args]); return name === 'claim_confirmation_email' ? { data: claim, error: null } : { data: null, error: null }; },
    from: (t) => ({ select: () => ({ eq: () => { const r = t === 'orders' ? { data: order, error: null } : { data: ITEMS, error: null }; return { single: async () => r, then: (f, g) => Promise.resolve(r).then(f, g) }; } }) }) };
}
const mailOn = (sent, fail = false) => ({ emailConfigured: () => true, sendEmail: async (m) => { if (fail) throw new Error('resend down'); sent.push(m); } });
const contactsSpy = (result = { ok: true }) => { const seen = []; return { seen, addResendContact: async (email, opts) => { seen.push([email, opts]); if (result === 'throw') throw new Error('boom'); return result; } }; };

test('a paid order: the confirmation goes out, then the buyer is added to the Resend contacts with their first name', async () => {
  const sent = [], c = contactsSpy();
  assert.equal(await sendConfirmationOnce(fakeDb(), REF, mailOn(sent), c), 'sent');
  assert.equal(sent.length, 1); assert.deepEqual(c.seen, [['ada@example.com', { firstName: 'Ada' }]]);
});
test('a Resend contacts failure (or crash) never turns a sent confirmation into a failure', async () => {
  for (const result of [{ ok: false, reason: 'resend 500' }, 'throw']) {
    const sent = []; assert.equal(await sendConfirmationOnce(fakeDb(), REF, mailOn(sent), contactsSpy(result)), 'sent'); assert.equal(sent.length, 1);
  }
});
test('no contact is added when the email was already sent, is switched off, or failed to send', async () => {
  const a = contactsSpy(); assert.equal(await sendConfirmationOnce(fakeDb({ claim: null }), REF, mailOn([]), a), 'already_sent'); assert.equal(a.seen.length, 0);
  const b = contactsSpy(); assert.equal(await sendConfirmationOnce(fakeDb(), REF, { emailConfigured: () => false }, b), 'skipped'); assert.equal(b.seen.length, 0);
  const c = contactsSpy(); const db = fakeDb();
  await assert.rejects(sendConfirmationOnce(db, REF, mailOn([], true), c), /resend down/);
  assert.equal(c.seen.length, 0); assert.ok(db.calls.some(([n]) => n === 'release_confirmation_email'), 'the claim is released so a retry can send');
});
test('a customer name can never smuggle markup into the contact (first name is letters only)', async () => {
  for (const [name, want] of [['<b>Ada</b> Obi', 'Ada'], ['Ada <script>x</script>', 'Ada'], ["  O'Neil Chi  ", "O'Neil"], ['Jean-Luc Picard', 'Jean-Luc']]) {
    const c = contactsSpy(); await sendConfirmationOnce(fakeDb({ order: mkOrder(name) }), REF, mailOn([]), c); assert.equal(c.seen[0][1].firstName, want, name);
  }
  const c = contactsSpy(); await sendConfirmationOnce(fakeDb({ order: mkOrder('<<>>') }), REF, mailOn([]), c); assert.equal(c.seen[0][1].firstName, undefined);
});
