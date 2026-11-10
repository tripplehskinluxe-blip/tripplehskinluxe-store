import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { addResendContact } from '../lib/resend-contacts.js';

mock.method(console, 'error', () => {});

test('addResendContact: not configured when no API key is set', async () => {
  const saved = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  assert.deepEqual(await addResendContact('a@example.com'), { ok: false, reason: 'not_configured' });
  if (saved !== undefined) process.env.RESEND_API_KEY = saved;
});
test('addResendContact: rejects an invalid email before ever calling Resend', async () => {
  process.env.RESEND_API_KEY = 'test_key'; let called = false;
  global.fetch = async () => { called = true; return { ok: true }; };
  const r = await addResendContact('not-an-email'); assert.equal(r.reason, 'invalid_email'); assert.equal(called, false);
});
test('addResendContact: posts to the Resend contacts endpoint with the email trimmed and lowercased', async () => {
  process.env.RESEND_API_KEY = 'test_key_123'; let seen;
  global.fetch = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({}) }; };
  assert.equal((await addResendContact('  Ada@Example.COM  ', { firstName: 'Ada' })).ok, true);
  assert.equal(seen.url, 'https://api.resend.com/contacts'); assert.equal(seen.init.method, 'POST'); assert.equal(seen.init.headers.Authorization, 'Bearer test_key_123');
  assert.deepEqual(JSON.parse(seen.init.body), { email: 'ada@example.com', first_name: 'Ada' });
});
test('addResendContact: no first_name is sent when there is none', async () => {
  process.env.RESEND_API_KEY = 'k'; let seen; global.fetch = async (u, init) => { seen = init; return { ok: true }; };
  await addResendContact('b@example.com'); assert.deepEqual(JSON.parse(seen.body), { email: 'b@example.com' });
});
test('addResendContact: an "already exists" answer counts as success, so the same email is never an error or a duplicate', async () => {
  process.env.RESEND_API_KEY = 'k';
  global.fetch = async () => ({ ok: false, status: 409, text: async () => 'Contact already exists' });
  assert.deepEqual(await addResendContact('dup@example.com'), { ok: true, already: true });
  global.fetch = async () => ({ ok: false, status: 422, text: async () => 'a contact with this email already exists' });
  assert.deepEqual(await addResendContact('dup@example.com'), { ok: true, already: true });
});
test('addResendContact: a real failure is reported, and a network failure never throws', async () => {
  process.env.RESEND_API_KEY = 'k';
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'API key is invalid' });
  const a = await addResendContact('x@example.com'); assert.equal(a.ok, false); assert.match(a.reason, /401/);
  global.fetch = async () => { throw new Error('fetch failed: ECONNRESET'); };
  const b = await addResendContact('x@example.com'); assert.equal(b.ok, false); assert.match(b.reason, /ECONNRESET/);
});
