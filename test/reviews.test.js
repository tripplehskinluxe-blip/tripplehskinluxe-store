import test from 'node:test';
import assert from 'node:assert/strict';
import { statusEmail } from '../lib/email.js';
import { sendStatusEmailOnce } from '../lib/settlement.js';
import { buildSettings } from '../lib/settings-core.js';

const S = buildSettings([]);
const ORDER = { id: 'o1', order_number: 'ONL-2026-1001', customer_name: 'Ada', customer_email: 'ada@example.com', status: 'delivered', delivery_method: 'delivery' };

test('delivered email: has a review link when one is given, never invents one, and escapes it', () => {
  const m = statusEmail(ORDER, S, 'abc123deadbeef');
  assert.match(m.html, /\/review\/abc123deadbeef/); assert.match(m.html, /Write a review/); assert.match(m.text, /\/review\/abc123deadbeef/);
  const none = statusEmail(ORDER, S, null); assert.doesNotMatch(none.html, /\/review\//); assert.doesNotMatch(none.text, /Write a review/);
  const bare = statusEmail(ORDER, S); assert.doesNotMatch(bare.html, /\/review\//);
  const evil = statusEmail(ORDER, S, '"><script>alert(1)</script>'); assert.doesNotMatch(evil.html, /<script>alert/);
});

test('a review link is never offered for any status except delivered', () => {
  for (const status of ['pending', 'processing', 'packed', 'shipped', 'out_for_delivery']) {
    const m = statusEmail({ ...ORDER, status }, S, 'abc123');
    if (m) assert.doesNotMatch(m.html, /\/review\//, status);
  }
  const collected = statusEmail({ ...ORDER, status: 'delivered', delivery_method: 'pickup' }, S, 'abc123');
  assert.match(collected.subject, /collecting/i); assert.match(collected.html, /\/review\/abc123/);
});

test('sendStatusEmailOnce: a delivered order asks for a review link before building the email; other statuses never ask', async () => {
  const calls = [];
  const mkDb = (claim, rtResult) => ({
    rpc: async (name, args) => { calls.push([name, args]); if (name === 'claim_status_email') return { data: claim, error: null }; if (name === 'issue_review_token') return rtResult; return { data: null, error: null }; },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { ...ORDER, status: claim.status }, error: null }) }) }) }),
  });
  const mail = { emailConfigured: () => true, sent: [], sendEmail: async function (m) { this.sent.push(m); } };
  const delivered = mkDb({ id: 'o1', status: 'delivered' }, { data: 'thetoken', error: null });
  await sendStatusEmailOnce(delivered, 'o1', mail);
  assert.deepEqual(calls.map((c) => c[0]), ['claim_status_email', 'issue_review_token']);
  assert.match(mail.sent[0].html, /\/review\/thetoken/);

  mail.sent.length = 0; calls.length = 0;
  const shipped = mkDb({ id: 'o1', status: 'shipped' }, { data: 'unused', error: null });
  await sendStatusEmailOnce(shipped, 'o1', mail);
  assert.ok(!calls.some(([n]) => n === 'issue_review_token'), 'a non-delivered status must never ask for a review link');

  mail.sent.length = 0; calls.length = 0;
  const brokenLink = mkDb({ id: 'o1', status: 'delivered' }, { data: null, error: { message: 'db hiccup' } });
  const r = await sendStatusEmailOnce(brokenLink, 'o1', mail);
  assert.equal(r, 'sent'); assert.doesNotMatch(mail.sent[0].html, /\/review\//, 'a failure to get a link must still send the delivered email, just without the link');
});
