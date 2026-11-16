import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { customerCanCancel, refundOrder, finishCancellation, sendRefundEmailOnce, approveRefund, declineRefund } from '../lib/cancellation.js';
import { createPaystackRefund } from '../lib/refund.js';
import { cancellationEmail, refundEmail, refundDeclinedEmail } from '../lib/email.js';
import { handlePaystackWebhook } from '../lib/settlement.js';
import { buildSettings } from '../lib/settings-core.js';

mock.method(console, 'error', () => {});
const S = buildSettings([]);
const REF = 'ths_12345678-1234-1234-1234-123456789abc';
const ORDER = { id: 'o1', order_number: 'ONL-2026-1001', customer_name: 'Ada', customer_email: 'ada@example.com', total_ngn: 12000, status: 'cancelled', payment_status: 'paid', channel: 'online', cancelled_by: 'customer', delivery_method: 'delivery' };

function fakeDb({ order = ORDER, rpc = {} } = {}) {
  const calls = [];
  return { calls, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: order, error: null }) }) }) }),
    rpc: async (name, args) => { calls.push([name, args]); const r = rpc[name]; return typeof r === 'function' ? r(args) : r ?? { data: null, error: null }; } };
}
const fakeMail = (ok = true) => { const sent = []; return { sent, emailConfigured: () => true, sendEmail: async (m) => { if (!ok) throw new Error('resend down'); sent.push(m); } }; };

test('who may cancel: until shipped (pickup: until ready); never in-store, delivered or refunded orders', () => {
  const o = (x) => ({ order_number: 'ONL-2026-1', channel: 'online', payment_status: 'paid', delivery_method: 'delivery', status: 'processing', ...x });
  for (const s of ['pending', 'processing', 'packed']) assert.equal(customerCanCancel(o({ status: s })), true, s);
  for (const s of ['shipped', 'out_for_delivery', 'delivered', 'cancelled']) assert.equal(customerCanCancel(o({ status: s })), false, s);
  assert.equal(customerCanCancel(o({ delivery_method: 'pickup', status: 'processing' })), true);
  assert.equal(customerCanCancel(o({ delivery_method: 'pickup', status: 'ready_for_pickup' })), false);
  assert.equal(customerCanCancel(o({ payment_status: 'refunded' })), false);
  assert.equal(customerCanCancel(o({ payment_status: 'unpaid', status: 'pending' })), true);
  assert.equal(customerCanCancel(o({ order_number: 'STR-2026-1', channel: 'store' })), false);
});

test('Paystack refund call: exact request, success, refusal, outage, missing key', async () => {
  let seen;
  const ok = await createPaystackRefund({ secret: 'sk', reference: REF, amountKobo: 1200000, orderNumber: 'ONL-1' }, { fetch: async (u, i) => { seen = { u, i }; return { ok: true, json: async () => ({ status: true, data: { id: 77, status: 'pending' } }) }; } });
  assert.deepEqual(ok, { ok: true, state: 'pending', id: '77' });
  assert.equal(seen.u, 'https://api.paystack.co/refund'); assert.equal(seen.i.headers.Authorization, 'Bearer sk');
  const body = JSON.parse(seen.i.body); assert.equal(body.transaction, REF); assert.equal(body.amount, 1200000); assert.equal(body.currency, 'NGN');
  const no = await createPaystackRefund({ secret: 'sk', reference: REF, amountKobo: 1 }, { fetch: async () => ({ ok: false, status: 400, json: async () => ({ status: false, message: 'Transaction has been fully reversed' }) }) });
  assert.equal(no.ok, false); assert.match(no.error, /fully reversed/);
  assert.equal((await createPaystackRefund({ secret: 'sk', reference: REF, amountKobo: 1 }, { fetch: async () => { throw new Error('net'); } })).ok, false);
  assert.equal((await createPaystackRefund({ reference: REF, amountKobo: 1 })).ok, false);
});

test('refundOrder: claims first, sends the exact amount, records the answer; every other state is safe', async () => {
  const db = fakeDb({ rpc: { refund_claim: { data: { claimed: true, reference: REF, amount_kobo: 1200000, order_number: 'ONL-2026-1001' } } } });
  let asked;
  const r = await refundOrder(db, 'o1', { secret: 'sk', deps: { refund: async (a) => { asked = a; return { ok: true, id: '9' }; } } });
  assert.equal(r.state, 'issued'); assert.deepEqual(asked, { secret: 'sk', reference: REF, amountKobo: 1200000, orderNumber: 'ONL-2026-1001' });
  assert.deepEqual(db.calls.map((c) => c[0]), ['refund_claim', 'refund_result']); assert.equal(db.calls[1][1].p_ok, true);
  const failed = fakeDb({ rpc: { refund_claim: { data: { claimed: true, reference: REF, amount_kobo: 5, order_number: 'X' } } } });
  const f = await refundOrder(failed, 'o1', { deps: { refund: async () => ({ ok: false, error: 'No balance' }) } });
  assert.equal(f.state, 'failed'); assert.equal(failed.calls[1][1].p_ok, false); assert.equal(failed.calls[1][1].p_error, 'No balance');
  const busy = fakeDb({ rpc: { refund_claim: { data: { claimed: false, reason: 'already', status: 'processing' } } } });
  assert.equal((await refundOrder(busy, 'o1', { deps: { refund: async () => { throw new Error('must not call Paystack'); } } })).state, 'busy');
  assert.equal((await refundOrder(fakeDb({ rpc: { refund_claim: { data: { claimed: false, reason: 'already', status: 'accepted' } } } }), 'o1')).state, 'issued');
  assert.equal((await refundOrder(fakeDb({ rpc: { refund_claim: { data: { claimed: false, reason: 'not_refundable', payment_status: 'unpaid' } } } }), 'o1')).state, 'none');
  assert.equal((await refundOrder(fakeDb({ rpc: { refund_claim: { error: { message: 'db down' } } } }), 'o1')).state, 'failed');
});

const PAID = { ...ORDER, status: "cancelled", channel: "online", payment_status: "paid" };
const claimOk = { claim_order_email: { data: true, error: null } };

test("finishCancellation: a PAID order is never refunded by itself; ONE email says the refund is with our team", async () => {
  const db = fakeDb({ order: PAID, rpc: claimOk }); const mail = fakeMail();
  assert.deepEqual(await finishCancellation(db, "o1", { mail }), { refund: "review", email: "sent" });
  assert.ok(!db.calls.some(([n]) => n === "refund_claim" || n === "refund_result"), "no refund may be claimed or sent");
  assert.equal(mail.sent.length, 1); assert.match(mail.sent[0].text, /with our team for approval/i); assert.doesNotMatch(mail.sent[0].text, /issued a refund|refunding all of it/i);
});

test("refundOrder: an unapproved or declined refund is never sent to Paystack, even when forced by hand", async () => {
  for (const [status, state] of [["awaiting_approval", "awaiting"], ["declined", "declined"]]) {
    let called = false;
    const db = fakeDb({ rpc: { refund_claim: { data: { claimed: false, reason: "already", status }, error: null } } });
    const r = await refundOrder(db, "o1", { manual: true, actor: "u1", deps: { refund: async () => { called = true; return { ok: true }; } } });
    assert.equal(r.state, state); assert.equal(called, false);
    assert.deepEqual(db.calls[0], ["refund_claim", { p_order: "o1", p_manual: true, p_actor: "u1" }]);
  }
});

const asUserWith = (result) => { const calls = []; return { calls, rpc: async (n, a) => { calls.push([n, a]); return typeof result === "function" ? result(n, a) : result; } }; };
const CLAIM = { claimed: true, reference: "ths_x", amount_kobo: 1200000, order_number: "ONL-2026-1001" };

test("approveRefund: the database approves as the signed-in person, THEN Paystack is asked once for the exact amount, THEN the customer is told", async () => {
  const db = fakeDb({ order: { ...PAID, payment_status: "refunded" }, rpc: { refund_claim: { data: CLAIM, error: null }, ...claimOk } });
  const user = asUserWith({ data: { code: "ok" }, error: null }); const mail = fakeMail(); const sent = [];
  const r = await approveRefund(user, db, "o1", { mail, deps: { refund: async (x) => { sent.push(x); return { ok: true, id: "7" }; } } });
  assert.deepEqual(r, { ok: true, refund: "issued", error: undefined, email: "sent" });
  assert.deepEqual(user.calls, [["approve_refund", { p_order: "o1" }]]);
  assert.equal(sent.length, 1); assert.equal(sent[0].amountKobo, 1200000); assert.equal(sent[0].reference, "ths_x");
  assert.match(mail.sent[0].subject, /refund .* has been issued/i);
});

test("approveRefund: if the person may not approve (or it is not waiting), nothing is claimed and Paystack is never called", async () => {
  for (const [res, code] of [[{ data: null, error: { code: "42501", message: "forbidden" } }, "forbidden"], [{ data: { code: "not_awaiting" }, error: null }, "not_awaiting"], [{ data: { code: "not_refundable" }, error: null }, "not_refundable"]]) {
    let called = false; const db = fakeDb({ rpc: { refund_claim: { data: CLAIM, error: null } } });
    const r = await approveRefund(asUserWith(res), db, "o1", { mail: fakeMail(), deps: { refund: async () => { called = true; return { ok: true }; } } });
    assert.equal(r.ok, false); assert.equal(r.code, code); assert.equal(called, false); assert.ok(!db.calls.some(([n]) => n === "refund_claim"));
  }
});

test("approveRefund: approved but Paystack refuses -> reported as failed, no refund-issued email, and it can be retried", async () => {
  const db = fakeDb({ order: { ...PAID, payment_status: "paid" }, rpc: { refund_claim: { data: CLAIM, error: null }, ...claimOk } }); const mail = fakeMail();
  const r = await approveRefund(asUserWith({ data: { code: "ok" }, error: null }), db, "o1", { mail, deps: { refund: async () => ({ ok: false, error: "Insufficient balance" }) } });
  assert.deepEqual([r.ok, r.refund, r.email, r.error], [true, "failed", "skipped", "Insufficient balance"]); assert.equal(mail.sent.length, 0);
});

test("declineRefund: the customer is told once (order still active); a person without permission changes nothing and nobody is emailed", async () => {
  const db = fakeDb({ order: PAID, rpc: claimOk }); const mail = fakeMail();
  const r = await declineRefund(asUserWith({ data: { code: "ok", reinstated: true }, error: null }), db, "o1", "already dispatched", { mail });
  assert.deepEqual([r.ok, r.reinstated, r.email], [true, true, "sent"]); assert.match(mail.sent[0].text, /not able to cancel/i); assert.match(mail.sent[0].text, /stays active/i);
  assert.ok(!db.calls.some(([n]) => n === "refund_claim"));
  const m2 = fakeMail(); const d2 = fakeDb({ order: PAID, rpc: claimOk });
  const bad = await declineRefund(asUserWith({ data: null, error: { code: "42501", message: "forbidden" } }), d2, "o1", "", { mail: m2 });
  assert.deepEqual([bad.ok, bad.code, m2.sent.length], [false, "forbidden", 0]);
});

test("emails: the cancellation wording for a refund under review, and the declined emails (names escaped)", () => {
  const review = cancellationEmail({ ...PAID }, "review", S); assert.match(review.text, /with our team for approval/i); assert.doesNotMatch(review.text, /We have issued|refunding all of it/);
  const evil = { ...PAID, customer_name: "<b>Ada</b>" };
  for (const back of [true, false]) { const m = refundDeclinedEmail(evil, back, S); assert.doesNotMatch(m.html, /<b>Ada<\/b>/); assert.match(m.subject, back ? /still active/i : /About your refund/i); }
});

test('finishCancellation: unpaid order, in-store order, already-sent email, email outage, email not set up', async () => {
  const unpaid = fakeDb({ order: { ...ORDER, payment_status: 'unpaid' }, rpc: { claim_order_email: { data: true } } }); const m1 = fakeMail();
  assert.equal((await finishCancellation(unpaid, 'o1', { mail: m1 })).refund, 'none'); assert.match(m1.sent[0].text, /not been charged/);
  assert.ok(!unpaid.calls.some(([n]) => n === 'refund_claim'), 'nothing to refund, so Paystack is never asked');
  const store = fakeDb({ order: { ...ORDER, channel: 'store' } }); const m2 = fakeMail();
  assert.deepEqual(await finishCancellation(store, 'o1', { mail: m2 }), { refund: 'none', email: 'skipped' }); assert.equal(m2.sent.length, 0);
  const again = fakeDb({ order: { ...ORDER, payment_status: 'refunded' }, rpc: { claim_order_email: { data: false } } }); const m3 = fakeMail();
  assert.equal((await finishCancellation(again, 'o1', { mail: m3 })).email, 'already_sent'); assert.equal(m3.sent.length, 0);
  const down = fakeDb({ order: { ...ORDER, payment_status: 'unpaid' }, rpc: { claim_order_email: { data: true } } });
  assert.equal((await finishCancellation(down, 'o1', { mail: fakeMail(false) })).email, 'failed');
  assert.ok(down.calls.some(([n]) => n === 'release_order_email'), 'a failed send is released so it can be tried again');
  assert.equal((await finishCancellation(fakeDb({ order: { ...ORDER, payment_status: 'unpaid' } }), 'o1', { mail: { emailConfigured: () => false } })).email, 'skipped');
  await assert.rejects(finishCancellation(fakeDb({ order: { ...ORDER, status: 'processing' } }), 'o1', { mail: fakeMail() }), /not cancelled/);
});

test('refund email: only for a cancelled, refunded online order, once', async () => {
  const mail = fakeMail(); const ok = fakeDb({ order: { ...ORDER, payment_status: 'refunded' }, rpc: { claim_order_email: { data: true } } });
  assert.equal(await sendRefundEmailOnce(ok, 'o1', mail), 'sent'); assert.match(mail.sent[0].subject, /refund .* has been issued/);
  assert.equal(await sendRefundEmailOnce(fakeDb({ order: { ...ORDER, payment_status: 'paid' } }), 'o1', mail), 'not_needed');
  assert.equal(await sendRefundEmailOnce(fakeDb({ order: { ...ORDER, payment_status: 'refunded', status: 'processing' } }), 'o1', mail), 'not_needed');
});

test('cancellation emails: wording per case, and customer names are escaped', () => {
  assert.match(cancellationEmail({ ...ORDER, cancelled_by: 'customer' }, 'none', S).text, /As you asked/);
  assert.match(cancellationEmail({ ...ORDER, cancelled_by: 'staff' }, 'issued', S).text, /Your order ONL-2026-1001 has been cancelled/);
  const evil = cancellationEmail({ ...ORDER, customer_name: '<img src=x onerror=alert(1)>' }, 'issued', S);
  assert.doesNotMatch(evil.html, /<img src=x/); assert.match(refundEmail(ORDER, S).html, /12,000/);
});

test('webhook: Paystack refund news reaches the database; foreign references are ignored; a database error asks Paystack to retry', async () => {
  const signed = { verifySignature: () => true };
  const body = (event, ref = REF, extra = {}) => Buffer.from(JSON.stringify({ event, data: { transaction_reference: ref, id: 55, ...extra } }));
  const db = fakeDb();
  assert.equal((await handlePaystackWebhook({ raw: body('refund.processed'), signature: 's', secret: 'k', db, deps: signed })).status, 200);
  assert.deepEqual(db.calls[0], ['refund_event', { p_reference: REF, p_state: 'processed', p_paystack_id: '55' }]);
  await handlePaystackWebhook({ raw: body('refund.needs-attention'), signature: 's', secret: 'k', db, deps: signed });
  assert.equal(db.calls[1][1].p_state, 'needs-attention');
  const foreign = fakeDb(); assert.equal((await handlePaystackWebhook({ raw: body('refund.processed', 'someone-elses'), signature: 's', secret: 'k', db: foreign, deps: signed })).status, 200); assert.equal(foreign.calls.length, 0);
  const broken = fakeDb({ rpc: { refund_event: { error: { message: 'down' } } } });
  assert.equal((await handlePaystackWebhook({ raw: body('refund.failed'), signature: 's', secret: 'k', db: broken, deps: signed })).status, 500);
  assert.equal((await handlePaystackWebhook({ raw: body('refund.processed'), signature: 'bad', secret: 'k', db: foreign })).status, 401);
});
