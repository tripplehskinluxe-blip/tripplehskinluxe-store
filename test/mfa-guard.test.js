import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMfa } from '../lib/mfa-guard.js';
import { subjectsFor, hashOf } from '../lib/lockout.js';

const UID = '00000000-0000-4000-8000-0000000000a1', FID = '11111111-1111-4111-8111-111111111111', FID2 = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-01-01T00:00:00Z');
const user = { id: UID };

function mk({ factors = [{ id: FID, factor_type: 'totp', status: 'verified' }], check = null, checkErr = null, failure = null, verify, challenge, enroll, list } = {}) {
  const log = [];
  const db = { rpc: async (n, a) => { log.push([n, a]); if (n === 'login_check') return { data: check, error: checkErr }; if (n === 'login_failure') return { data: failure, error: null }; return { data: null, error: null }; } };
  const gotrue = {
    listFactors: async () => { log.push(['listFactors']); return list ? list() : { data: { factors }, error: null }; },
    deleteFactor: async (t, id) => { log.push(['deleteFactor', id]); return { data: {}, error: null }; },
    enroll: async (t, a) => { log.push(['enroll', a]); return enroll ? enroll() : { data: { id: FID2, totp: { qr_code: '<svg/>', secret: 'ABCD' } }, error: null }; },
    challenge: async () => { log.push(['challenge']); return challenge ? challenge() : { data: { id: 'ch1' }, error: null }; },
    verify: async (t, id, ch, code) => { log.push(['verify', id, ch, code]); return verify ? verify() : { data: { access_token: 'AT', refresh_token: 'RT', user: { secret: 'x' } }, error: null }; },
  };
  return { db, gotrue, log, names: () => log.map((l) => l[0]) };
}
const run = (m, body, over = {}) => handleMfa({ db: m.db, gotrue: m.gotrue, user, role: 'staff', token: 'tok', ip: '1.2.3.4', issuer: 'Tripple H Skin Luxe', body, nowMs: NOW, ...over });
const verifyBody = (o = {}) => ({ action: 'verify', factor_id: FID, code: '123456', ...o });

test('2fa: only team members get anywhere (a customer account is refused before anything is called)', async () => {
  for (const role of ['customer', undefined, 'owner']) { const m = mk(); const r = await run(m, { action: 'status' }, { role }); assert.equal(r.status, 403); assert.equal(m.log.length, 0); }
});

test('2fa: status says whether to verify (a verified authenticator exists) or enroll (none yet)', async () => {
  assert.deepEqual((await run(mk(), { action: 'status' })).body, { ok: true, next: 'verify', factor_id: FID });
  const none = (await run(mk({ factors: [] }), { action: 'status' })).body; assert.equal(none.next, 'enroll'); assert.equal(none.factor_id, null);
  const half = (await run(mk({ factors: [{ id: FID, factor_type: 'totp', status: 'unverified' }] }), { action: 'status' })).body; assert.equal(half.next, 'enroll');
});

test('2fa: enrolling uses the SHOP NAME as the issuer, chosen by the server (the browser cannot pick it)', async () => {
  const m = mk({ factors: [] }); const r = await run(m, { action: 'enroll', issuer: 'localhost:3000', friendly_name: 'evil' });
  assert.equal(r.status, 200); assert.equal(r.body.factor_id, FID2); assert.equal(r.body.secret, 'ABCD');
  const call = m.log.find((l) => l[0] === 'enroll')[1]; assert.equal(call.issuer, 'Tripple H Skin Luxe'); assert.ok(!/evil|localhost/.test(call.friendlyName));
  assert.ok(r.body.qr_code.startsWith('data:image/svg+xml;utf-8,'));
});

test('2fa: half-finished set-ups are cleared before a new one, so enrolling never gets stuck', async () => {
  const m = mk({ factors: [{ id: FID, factor_type: 'totp', status: 'unverified' }] }); await run(m, { action: 'enroll' });
  assert.deepEqual(m.names(), ['listFactors', 'deleteFactor', 'enroll']);
});

test('2fa: a password alone can NOT add a second authenticator when one is already verified', async () => {
  const m = mk(); const r = await run(m, { action: 'enroll' });
  assert.equal(r.status, 409); assert.ok(!m.names().includes('enroll') && !m.names().includes('deleteFactor'));
});

test('2fa: enrolling fails safely when the provider misbehaves', async () => {
  for (const enroll of [() => ({ data: null, error: { status: 500 } }), () => ({ data: { id: FID2 }, error: null })]) { const r = await run(mk({ factors: [], enroll }), { action: 'enroll' }); assert.equal(r.status, 502); }
});

test('2fa: a correct code returns the session tokens only (no user object) and clears only this person\'s counter', async () => {
  const m = mk(); const r = await run(m, verifyBody());
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.body.session).sort(), ['access_token', 'refresh_token']); assert.equal(r.body.role, 'staff');
  assert.deepEqual(m.log.find((l) => l[0] === 'verify').slice(1), [FID, 'ch1', '123456']);
  const cleared = m.log.find((l) => l[0] === 'login_success')[1].p_subjects; assert.deepEqual(cleared, [`m:${hashOf(UID)}`]);
});

test('2fa: the lock is checked FIRST; a locked person is refused even with the right code, and nothing is sent to the provider', async () => {
  const until = new Date(NOW + 14 * 60000).toISOString(); const m = mk({ check: until });
  const r = await run(m, verifyBody()); assert.equal(r.status, 429); assert.match(r.body.error, /14 minutes/); assert.ok(!m.names().includes('challenge') && !m.names().includes('verify'));
});

test('2fa: a wrong code is recorded; the one that triggers the lock says how long', async () => {
  const m = mk({ verify: () => ({ data: null, error: { status: 400, code: 'mfa_verification_failed' } }) });
  const r = await run(m, verifyBody()); assert.equal(r.status, 401); assert.match(r.body.error, /not right/);
  assert.deepEqual(m.log.find((l) => l[0] === 'login_failure')[1].p_subjects, subjectsFor('m', UID, '1.2.3.4'));
  const locked = mk({ verify: () => ({ data: null, error: { status: 400 } }), failure: new Date(NOW + 15 * 60000).toISOString() });
  const r2 = await run(locked, verifyBody()); assert.equal(r2.status, 429); assert.match(r2.body.error, /15 minutes/);
});

test('2fa: if the lock cannot be checked, nobody gets in (fails closed) and no code is tried', async () => {
  const m = mk({ checkErr: { message: 'db down' } }); const r = await run(m, verifyBody());
  assert.equal(r.status, 503); assert.ok(!m.names().includes('verify'));
});

test('2fa: a provider outage or rate limit is not counted as a wrong code', async () => {
  for (const [st, want] of [[0, 502], [500, 502], [429, 429]]) {
    const m = mk({ verify: () => ({ data: null, error: { status: st } }) }); const r = await run(m, verifyBody());
    assert.equal(r.status, want); assert.ok(!m.names().includes('login_failure'));
  }
  const m = mk({ challenge: () => ({ data: null, error: { status: 503 } }) }); assert.equal((await run(m, verifyBody())).status, 502); assert.ok(!m.names().includes('login_failure'));
});

test('2fa: bad input is refused without a lock check or any provider call', async () => {
  for (const b of [verifyBody({ code: '12345' }), verifyBody({ code: 'abcdef' }), verifyBody({ code: '1234567' }), verifyBody({ factor_id: 'nope' }), verifyBody({ factor_id: FID2 }), verifyBody({ code: undefined }), { action: 'verify' }, { action: 'make_admin' }, {}]) {
    const m = mk(); const r = await run(m, b); assert.ok([400].includes(r.status), JSON.stringify(b));
    assert.ok(!m.names().some((n) => ['challenge', 'verify', 'login_check', 'login_failure'].includes(n)));
  }
});

test('2fa: spaces in the typed code are fine ("123 456")', async () => {
  const m = mk(); assert.equal((await run(m, verifyBody({ code: '123 456' }))).status, 200); assert.equal(m.log.find((l) => l[0] === 'verify')[3], '123456');
});

test('2fa: an unknown IP is not locked (only the person); a known IP is counted too', async () => {
  const a = mk(); await run(a, verifyBody(), { ip: 'unknown' }); assert.equal(a.log.find((l) => l[0] === 'login_check')[1].p_subjects.length, 1);
  const b = mk(); await run(b, verifyBody()); assert.equal(b.log.find((l) => l[0] === 'login_check')[1].p_subjects.length, 2);
});

test('2fa: a lapsed login token is reported as such, not as an outage', async () => {
  const r = await run(mk({ list: () => ({ data: null, error: { status: 401 } }) }), { action: 'status' }); assert.equal(r.status, 401);
});
