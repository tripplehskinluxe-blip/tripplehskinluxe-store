import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTeamAction, validateEmail, validatePassword } from '../lib/team.js';

const ID = '11111111-1111-4111-8111-111111111111';
const PW = 'Kq7!mW2xZp9#vL4n';

function mk({ rpc = () => ({ error: null }), create, update, del, factors } = {}) {
  const log = [];
  const asUser = { rpc: async (name, args) => { log.push(['rpc', name, args]); return rpc(name, args); } };
  const adminApi = {
    createUser: async (a) => { log.push(['createUser', a]); return create ? create(a) : { data: { user: { id: ID } }, error: null }; },
    updateUserById: async (id, a) => { log.push(['updateUserById', id, a]); return update ? update() : { data: {}, error: null }; },
    deleteUser: async (id) => { log.push(['deleteUser', id]); return del ? del() : { data: {}, error: null }; },
    mfa: {
      listFactors: async (a) => { log.push(['listFactors', a]); return factors ? factors() : { data: { factors: [{ id: 'f1' }, { id: 'f2' }] }, error: null }; },
      deleteFactor: async (a) => { log.push(['deleteFactor', a]); return { data: {}, error: null }; },
    },
  };
  return { asUser, adminApi, log, names: () => log.map((l) => l[0] === 'rpc' ? l[1] : l[0]) };
}
const run = (m, body) => handleTeamAction({ asUser: m.asUser, adminApi: m.adminApi, body });

test('team: create makes a login then gives it ONLY the staff role (role is fixed in code, never from the browser)', async () => {
  const m = mk(); const r = await run(m, { action: 'create', email: ' Till@Shop.com ', password: PW, role: 'admin', p_to: 'admin', user_metadata: { role: 'admin' } });
  assert.equal(r.status, 200); assert.equal(r.body.email, 'till@shop.com');
  assert.deepEqual(m.names(), ['createUser', 'team_set_role']);
  assert.deepEqual(m.log[0][1], { email: 'till@shop.com', password: PW, email_confirm: true });          // nothing else from the browser is forwarded
  assert.deepEqual(m.log[1][2], { p_user: ID, p_from: 'customer', p_to: 'staff' });
});

test('team: if the database refuses the role, the new login is deleted again (no half-made account)', async () => {
  const m = mk({ rpc: () => ({ error: { message: 'forbidden', code: '42501' } }) });
  const r = await run(m, { action: 'create', email: 'till@shop.com', password: PW });
  assert.equal(r.status, 403); assert.deepEqual(m.names(), ['createUser', 'team_set_role', 'deleteUser']); assert.equal(m.log[2][1], ID);
});

test('team: an email that already has an account is refused and nothing is promoted (no account takeover)', async () => {
  for (const error of [{ code: 'email_exists', status: 422, message: 'x' }, { message: 'A user with this email address has already been registered' }]) {
    const m = mk({ create: () => ({ data: { user: null }, error }) });
    const r = await run(m, { action: 'create', email: 'till@shop.com', password: PW });
    assert.equal(r.status, 409); assert.deepEqual(m.names(), ['createUser']);
  }
});

test('team: create input checks run BEFORE anything is called', async () => {
  for (const b of [{ email: 'nope', password: PW }, { email: 'a@b.co', password: 'short' }, { email: 'a@b.co' }, { email: 'till@shop.com', password: 'tillshop-till@shop.com' }, { email: 'a@b.co', password: 'x'.repeat(80) }]) {
    const m = mk(); const r = await run(m, { action: 'create', ...b }); assert.equal(r.status, 422); assert.equal(m.log.length, 0);
  }
});

test('team: remove takes access away FIRST, then deletes the login', async () => {
  const m = mk(); const r = await run(m, { action: 'remove', user_id: ID });
  assert.equal(r.status, 200); assert.deepEqual(m.names(), ['team_set_role', 'deleteUser']); assert.deepEqual(m.log[0][2], { p_user: ID, p_from: 'staff', p_to: 'customer' });
});

test('team: remove of an admin / yourself / a non-staff is refused by the database and nothing is deleted', async () => {
  for (const message of ['that person does not have the expected role', 'you cannot do this to your own account', 'that role change is not allowed here']) {
    const m = mk({ rpc: () => ({ error: { message } }) }); const r = await run(m, { action: 'remove', user_id: ID });
    assert.ok([400, 409].includes(r.status)); assert.deepEqual(m.names(), ['team_set_role']);
  }
});

test('team: if the login cannot be deleted, access is still gone and the admin is told what to do', async () => {
  const m = mk({ del: () => ({ error: { message: 'boom' } }) }); const r = await run(m, { action: 'remove', user_id: ID });
  assert.equal(r.status, 200); assert.match(r.body.warning, /Supabase/);
});

test('team: reset password checks the target in the database BEFORE touching the login', async () => {
  const m = mk(); const r = await run(m, { action: 'reset_password', user_id: ID, password: PW });
  assert.equal(r.status, 200); assert.deepEqual(m.names(), ['team_check_target', 'updateUserById']);
  assert.deepEqual(m.log[0][2], { p_user: ID, p_expected_role: 'staff', p_action: 'reset_password' });
  const bad = mk({ rpc: () => ({ error: { message: 'that person is not a staff member' } }) });
  const r2 = await run(bad, { action: 'reset_password', user_id: ID, password: PW });
  assert.equal(r2.status, 409); assert.deepEqual(bad.names(), ['team_check_target']);                       // an admin's password is never touched
});

test('team: reset authenticator removes every factor, after the database check', async () => {
  const m = mk(); const r = await run(m, { action: 'reset_mfa', user_id: ID });
  assert.equal(r.body.removed, 2); assert.deepEqual(m.names(), ['team_check_target', 'listFactors', 'deleteFactor', 'deleteFactor']);
  const bad = mk({ rpc: () => ({ error: { message: 'x', code: '42501' } }) }); assert.equal((await run(bad, { action: 'reset_mfa', user_id: ID })).status, 403); assert.deepEqual(bad.names(), ['team_check_target']);
});

test('team: bad ids and unknown actions are refused without calling anything', async () => {
  for (const b of [{ action: 'remove', user_id: 'x' }, { action: 'remove' }, { action: 'remove', user_id: "' or 1=1" }, { action: 'make_admin', user_id: ID }, { action: 'promote', user_id: ID }, {}, null, { action: ['remove'], user_id: ID }]) {
    const m = mk(); const r = await run(m, b); assert.ok([400].includes(r.status)); assert.equal(m.log.length, 0);
  }
});

test('team: passwords never appear in responses or in logs', async () => {
  const logged = []; const orig = { e: console.error, l: console.log, w: console.warn };
  console.error = (...a) => logged.push(a.join(' ')); console.log = console.error; console.warn = console.error;
  try {
    const cases = [
      [mk({ create: () => ({ data: null, error: { code: 'weird', status: 500, message: `leaked ${PW}` } }) }), { action: 'create', email: 'a@b.co', password: PW }],
      [mk({ rpc: () => ({ error: { message: 'boom', code: 'XX' } }) }), { action: 'create', email: 'a@b.co', password: PW }],
      [mk({ update: () => ({ error: { code: 'x', message: 'bad' } }) }), { action: 'reset_password', user_id: ID, password: PW }],
      [mk(), { action: 'reset_password', user_id: ID, password: PW }],
    ];
    for (const [m, b] of cases) { const r = await run(m, b); assert.ok(!JSON.stringify(r).includes(PW)); }
  } finally { console.error = orig.e; console.log = orig.l; console.warn = orig.w; }
  assert.ok(!logged.join('\n').includes(PW), 'password found in logs');
});

test('team: Supabase failures give a safe message and are not mistaken for success', async () => {
  const m = mk({ create: () => ({ data: null, error: { code: 'unexpected_failure', status: 500, message: 'db' } }) });
  const r = await run(m, { action: 'create', email: 'a@b.co', password: PW }); assert.equal(r.status, 502); assert.deepEqual(m.names(), ['createUser']);
  const w = mk({ create: () => ({ data: null, error: { code: 'weak_password' } }) });
  assert.equal((await run(w, { action: 'create', email: 'a@b.co', password: PW })).status, 422);
  const noId = mk({ create: () => ({ data: { user: {} }, error: null }) });
  assert.equal((await run(noId, { action: 'create', email: 'a@b.co', password: PW })).status, 502); assert.deepEqual(noId.names(), ['createUser']);
});

test('validatePassword / validateEmail edge cases', () => {
  assert.equal(validatePassword(PW, 'a@b.co').ok, true); assert.equal(validatePassword('aaaaaaaaaaaaaaaa').ok, false); assert.equal(validatePassword('            ').ok, false);
  assert.equal(validatePassword('Pass\u0000word12345!').ok, false); assert.equal(validatePassword(123456789012).ok, false); assert.equal(validatePassword('é'.repeat(40)).ok, false);
  assert.equal(validateEmail('A@B.CO').email, 'a@b.co'); assert.equal(validateEmail('a b@c.co').ok, false); assert.equal(validateEmail('a@b').ok, false); assert.equal(validateEmail('a@b.co\r\nBcc: x@y.z').ok, false); assert.equal(validateEmail(undefined).ok, false);
});
