import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handlePaystackWebhook, settlePayment, sendStatusEmailOnce, isOurReference } from '../lib/settlement.js';
import { confirmationEmail, statusEmail } from '../lib/email.js';
import { buildSettings } from '../lib/settings-core.js';
const SETTINGS = buildSettings([]);

const SECRET = 'sk_test_unit';
const REF = 'ths_12345678-1234-1234-1234-123456789abc';
const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex');
const evt = (ref = REF, event = 'charge.success') => Buffer.from(JSON.stringify({ event, data: { reference: ref } }));

const ORDER = { id: 'o1', order_number: 'ONL-2026-1001', customer_name: 'Ada <b>Obi</b>', customer_email: 'ada@example.com', address: { address: '1 Test St', city: 'Lekki', state: 'Lagos' }, subtotal_ngn: 10000, delivery_ngn: 2000, discount_ngn: 0, discount_code: null, total_ngn: 12000, status: 'shipped' };
const ITEMS = [{ name: '<script>alert(1)</script> Serum', qty: 1, unit_price_ngn: 10000 }];

function fakeDb({ mark = 'paid', markError = null, claim = { id: 'o1' } } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'mark_order_paid') return { data: markError ? null : mark, error: markError };
      if (name === 'claim_confirmation_email' || name === 'claim_status_email') return { data: claim, error: null };
      return { data: null, error: null };
    },
    from: (t) => ({ select: () => ({ eq: () => { const r = t === 'orders' ? { data: ORDER, error: null } : { data: ITEMS, error: null }; return { single: async () => r, then: (f, g) => Promise.resolve(r).then(f, g) }; } }) }),
  };
}
const mailOn = (sent, fail = false) => ({ emailConfigured: () => true, sendEmail: async (m) => { if (fail) throw new Error('resend down'); sent.push(m); } });
const mailOff = { emailConfigured: () => false, sendEmail: async () => { throw new Error('must not send'); } };
const verifyOk = (amount = 1200000) => async () => ({ status: 'success', currency: 'NGN', amount });
const names = (db) => db.calls.map((c) => c[0]);

test('webhook: wrong signature is rejected and nothing runs', async () => {
  const db = fakeDb(); const raw = evt();
  const r = await handlePaystackWebhook({ raw, signature: 'deadbeef', secret: SECRET, db, deps: { verify: async () => { throw new Error('must not verify'); } } });
  assert.equal(r.status, 401); assert.equal(db.calls.length, 0);
});

test('webhook: signature computed over a DIFFERENT body is rejected (tampering)', async () => {
  const db = fakeDb(); const signed = evt(); const tampered = evt('ths_99999999-9999-9999-9999-999999999999');
  const r = await handlePaystackWebhook({ raw: tampered, signature: sign(signed), secret: SECRET, db });
  assert.equal(r.status, 401);
});

test('webhook: missing secret or signature header is rejected', async () => {
  const db = fakeDb(); const raw = evt();
  assert.equal((await handlePaystackWebhook({ raw, signature: '', secret: SECRET, db })).status, 401);
  assert.equal((await handlePaystackWebhook({ raw, signature: sign(raw), secret: '', db })).status, 401);
});

test('webhook: oversized body is refused', async () => {
  const r = await handlePaystackWebhook({ raw: Buffer.alloc(1_000_001, 'a'), signature: 'x', secret: SECRET, db: fakeDb() });
  assert.equal(r.status, 413);
});

test('webhook: valid charge.success marks paid using the amount Paystack reports', async () => {
  const db = fakeDb(); const raw = evt();
  const r = await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db, deps: { verify: verifyOk(1200000), mail: mailOff } });
  assert.equal(r.status, 200);
  assert.deepEqual(db.calls[0], ['mark_order_paid', { p_reference: REF, p_amount_kobo: 1200000 }]);
});

test('webhook: Paystack verify unreachable -> 500 so Paystack retries (no silent loss)', async () => {
  const db = fakeDb(); const raw = evt();
  const r = await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db, deps: { verify: async () => null, mail: mailOff } });
  assert.equal(r.status, 500); assert.equal(db.calls.length, 0);
});

test('webhook: database error -> 500 (retry)', async () => {
  const db = fakeDb({ markError: { message: 'boom' } }); const raw = evt();
  const r = await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db, deps: { verify: verifyOk(), mail: mailOff } });
  assert.equal(r.status, 500);
});

test('webhook: unsuccessful or non-NGN transaction does not touch the order', async () => {
  for (const tx of [{ status: 'failed', currency: 'NGN', amount: 1 }, { status: 'success', currency: 'USD', amount: 1200000 }]) {
    const db = fakeDb(); const raw = evt();
    const r = await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db, deps: { verify: async () => tx, mail: mailOff } });
    assert.equal(r.status, 200); assert.equal(db.calls.length, 0);
  }
});

test('webhook: other events and foreign references are ignored with 200', async () => {
  const db = fakeDb(); const verify = async () => { throw new Error('must not verify'); };
  const a = evt(REF, 'transfer.success'); const b = evt('someone-elses-ref');
  assert.equal((await handlePaystackWebhook({ raw: a, signature: sign(a), secret: SECRET, db, deps: { verify } })).status, 200);
  assert.equal((await handlePaystackWebhook({ raw: b, signature: sign(b), secret: SECRET, db, deps: { verify } })).status, 200);
  assert.equal(db.calls.length, 0);
});

test('webhook: invalid JSON with a valid signature -> 400', async () => {
  const raw = Buffer.from('not json');
  assert.equal((await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db: fakeDb() })).status, 400);
});

test('reference format check', () => {
  assert.ok(isOurReference(REF)); assert.ok(!isOurReference('abc')); assert.ok(!isOurReference(undefined)); assert.ok(!isOurReference('ths_' + 'x'.repeat(36)));
});

test('paid orders that need a person (cancelled / stock / amount) never email the customer', async () => {
  for (const mark of ['paid_cancelled', 'paid_stock_issue', 'amount_mismatch', 'not_found']) {
    const db = fakeDb({ mark });
    const r = await settlePayment(db, REF, { verify: verifyOk(), mail: mailOff });
    assert.equal(r.ok, true); assert.equal(r.outcome, mark); assert.ok(!names(db).includes('claim_confirmation_email'));
  }
});

test('confirmation email: sent once, content is HTML-escaped', async () => {
  const sent = []; const db = fakeDb();
  const r = await settlePayment(db, REF, { verify: verifyOk(), mail: mailOn(sent) });
  assert.equal(r.outcome, 'paid'); assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ada@example.com');
  assert.ok(!sent[0].html.includes('<script>') && !sent[0].html.includes('<b>Obi</b>'));
  assert.ok(sent[0].html.includes('&lt;script&gt;'));
});

test('confirmation email: already sent -> not sent again', async () => {
  const sent = []; const db = fakeDb({ mark: 'already_paid', claim: null });
  const r = await settlePayment(db, REF, { verify: verifyOk(), mail: mailOn(sent) });
  assert.equal(r.ok, true); assert.equal(sent.length, 0);
});

test('confirmation email failure: claim released and webhook asks Paystack to retry', async () => {
  const db = fakeDb(); const raw = evt();
  const r = await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db, deps: { verify: verifyOk(), mail: mailOn([], true) } });
  assert.equal(r.status, 500); assert.ok(names(db).includes('release_confirmation_email'));
});

test('email not configured: payments still work, no email attempted', async () => {
  const db = fakeDb(); const r = await settlePayment(db, REF, { verify: verifyOk(), mail: mailOff });
  assert.equal(r.ok, true); assert.ok(!names(db).includes('claim_confirmation_email'));
});

test('status email: sent from the database status; skipped when not needed or not configured', async () => {
  const sent = [];
  assert.equal(await sendStatusEmailOnce(fakeDb(), 'o1', mailOn(sent)), 'sent');
  assert.match(sent[0].subject, /shipped/i);
  assert.equal(await sendStatusEmailOnce(fakeDb({ claim: null }), 'o1', mailOn(sent)), 'not_needed');
  assert.equal(await sendStatusEmailOnce(fakeDb(), 'o1', mailOff), 'skipped');
  const db = fakeDb();
  await assert.rejects(() => sendStatusEmailOnce(db, 'o1', mailOn([], true)));
  assert.ok(names(db).includes('release_status_email'));
});

test('sendEmail: subject is flattened to one line, correct Resend request, errors surface', async () => {
  const { sendEmail } = await import('../lib/email.js');
  const realFetch = globalThis.fetch; let seen;
  process.env.RESEND_API_KEY = 're_test'; process.env.EMAIL_FROM = 'Shop <orders@example.com>';
  try {
    globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, text: async () => '' }; };
    await sendEmail({ to: 'a@b.co', subject: 'Hello\r\nBcc: evil@x.com', html: '<p>x</p>', text: 'x' });
    const body = JSON.parse(seen.init.body);
    assert.equal(seen.url, 'https://api.resend.com/emails');
    assert.equal(seen.init.headers.Authorization, 'Bearer re_test');
    assert.ok(!/[\r\n]/.test(body.subject)); assert.deepEqual(body.to, ['a@b.co']); assert.equal(body.from, 'Shop <orders@example.com>');
    globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'domain not verified' });
    await assert.rejects(() => sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), /resend 403/);
  } finally { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; }
});

test('status email templates: unknown status has no email', () => {
  assert.equal(statusEmail({ ...ORDER, status: 'processing' }, SETTINGS), null);
  assert.ok(statusEmail({ ...ORDER, status: 'delivered' }, SETTINGS).subject.includes('delivered'));
  assert.ok(confirmationEmail(ORDER, ITEMS, SETTINGS).subject.includes('ONL-2026-1001'));
  // shop name, address and delivery times come from the saved settings, not from code
  const custom = buildSettings([{ key: 'store', value: { ...SETTINGS.store, name: 'Glow House', address: '9 New Road, Ikeja' } }, { key: 'delivery', value: { ...SETTINGS.delivery, lagosDays: 'next day', otherDays: '2 days' } }]);
  const m = confirmationEmail(ORDER, ITEMS, custom);
  assert.ok(m.subject.includes('Glow House') && m.html.includes('9 New Road, Ikeja') && m.html.includes('next day in Lagos') && m.text.includes('2 days nationwide'));
  assert.ok(!m.html.includes('Tripple H'));
});

test('webhook: an unsigned request never builds the database client (lazy db)', async () => {
  let built = 0; const db = () => { built++; return fakeDb(); };
  const raw = evt();
  assert.equal((await handlePaystackWebhook({ raw, signature: '', secret: SECRET, db })).status, 401);
  assert.equal(built, 0);
  assert.equal((await handlePaystackWebhook({ raw, signature: sign(raw), secret: SECRET, db, deps: { verify: verifyOk(), mail: mailOff } })).status, 200);
  assert.equal(built, 1);
});
