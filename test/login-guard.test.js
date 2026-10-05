import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptLogin, emailSubject, ipSubject, lockMessage } from '../lib/login-guard.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const IN = (m) => new Date(NOW + m * 60000).toISOString();

function mk({ check = null, checkErr = null, failure = null, signIn }) {
  const calls = [];
  const db = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'login_check') return { data: check, error: checkErr };
    if (name === 'login_failure') return { data: failure, error: null };
    return { data: null, error: null };
  } };
  const signCalls = [];
  const fn = async (e, p) => { signCalls.push([e, p]); return signIn(e, p); };
  return { db, calls, signCalls, signIn: fn };
}
const ok = () => ({ session: { access_token: 'AT', refresh_token: 'RT', user: { id: 'secret-user-object' } } });
const bad = (status = 400) => () => ({ error: { status } });
const run = (m, over = {}) => attemptLogin({ db: m.db, signIn: m.signIn, email: 'Admin@Shop.com', password: 'pw', ip: '1.2.3.4', nowMs: NOW, ...over });

test('login: correct password -> session tokens only (no user object), email lock cleared, IP lock NOT cleared', async () => {
  const m = mk({ signIn: ok }); const r = await run(m);
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.body.session).sort(), ['access_token', 'refresh_token']);
  const s = m.calls.find((c) => c[0] === 'login_success')[1].p_subjects;
  assert.deepEqual(s, [emailSubject('admin@shop.com')]);                 // case-insensitive, email only
});

test('login: subjects are hashed (the raw email is never stored) and the IP is included', async () => {
  const m = mk({ signIn: bad() }); await run(m);
  const subj = m.calls[0][1].p_subjects;
  assert.equal(subj.length, 2); assert.ok(subj[0].startsWith('e:') && !subj[0].includes('admin') && subj[0].length === 66); assert.equal(subj[1], 'i:1.2.3.4');
});

test('login: unknown IP -> only the email is tracked (never lock everybody behind "unknown")', async () => {
  const m = mk({ signIn: bad() }); await run(m, { ip: 'unknown' });
  assert.equal(m.calls[0][1].p_subjects.length, 1); assert.equal(ipSubject('unknown'), null); assert.equal(ipSubject(''), null);
});

test('login: already locked -> 429 and the password is NEVER tried (a correct one would not work either)', async () => {
  const m = mk({ check: IN(14), signIn: ok }); const r = await run(m);
  assert.equal(r.status, 429); assert.match(r.body.error, /14 minutes/); assert.equal(r.body.retry_after_seconds, 14 * 60);
  assert.equal(m.signCalls.length, 0); assert.ok(!m.calls.some((c) => c[0] === 'login_success'));
});

test('login: wrong password below the limit -> 401 generic message, failure recorded', async () => {
  const m = mk({ failure: null, signIn: bad(400) }); const r = await run(m);
  assert.equal(r.status, 401); assert.equal(r.body.error, 'Incorrect email or password.');
  assert.ok(m.calls.some((c) => c[0] === 'login_failure'));
});

test('login: the wrong password that triggers the lock -> 429 with the wait time', async () => {
  const m = mk({ failure: IN(15), signIn: bad(400) }); const r = await run(m);
  assert.equal(r.status, 429); assert.match(r.body.error, /15 minutes/);
});

test('login: if the lock check itself fails, nobody gets in (fails CLOSED) and the password is not tried', async () => {
  const m = mk({ checkErr: { message: 'db down' }, signIn: ok }); const r = await run(m);
  assert.equal(r.status, 503); assert.equal(m.signCalls.length, 0);
});

test('login: Supabase outage (5xx / network) is not counted against the user', async () => {
  for (const st of [0, 500, 503]) {
    const m = mk({ signIn: bad(st) }); const r = await run(m);
    assert.equal(r.status, 502); assert.ok(!m.calls.some((c) => c[0] === 'login_failure'));
  }
});

test('login: Supabase own rate limit (429) is passed on, not counted', async () => {
  const m = mk({ signIn: bad(429) }); const r = await run(m);
  assert.equal(r.status, 429); assert.ok(!m.calls.some((c) => c[0] === 'login_failure'));
});

test('login: bad input is rejected before touching the database or Supabase', async () => {
  for (const [email, password] of [['', 'x'], ['not-an-email', 'x'], ['a@b.co', ''], ['a@b.co', 'x'.repeat(300)], [undefined, undefined], [{ a: 1 }, 'x']]) {
    const m = mk({ signIn: ok }); const r = await run(m, { email, password });
    assert.equal(r.status, 400); assert.equal(m.calls.length, 0); assert.equal(m.signCalls.length, 0);
  }
});

test('lockMessage: minutes / hours wording', () => {
  assert.match(lockMessage(IN(1), NOW).text, /1 minute\./); assert.match(lockMessage(IN(15), NOW).text, /15 minutes/);
  assert.match(lockMessage(IN(60), NOW).text, /1 hour\./); assert.match(lockMessage(IN(150), NOW).text, /2 hours 30 minutes/);
  assert.equal(lockMessage(IN(0), NOW).secs, 1);
  assert.match(lockMessage(new Date(NOW + 15 * 60000 + 1000).toISOString(), NOW).text, /15 minutes/);   // 15:01 still says 15
  assert.match(lockMessage(new Date(NOW + 20000).toISOString(), NOW).text, /1 minute\./);
});
