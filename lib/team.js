// Managing staff accounts from the team area. Plain JS so it can be tested without a server.
// SAFETY MODEL: the database decides what is allowed (008_team_management.sql): only admins with two-factor, only staff accounts,
// never an admin, never yourself. This file adds input checks and does the three things only Supabase's server API can do
// (create a login, change a password, delete a login). Passwords are passed straight through and are never logged or returned.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CTRL = /[\u0000-\u001F\u007F]/;

export function validateEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || CTRL.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  return { ok: true, email };
}

export function validatePassword(raw, email = '') {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter a password.' };
  if (raw.length < 12) return { ok: false, error: 'The password must be at least 12 characters.' };
  if (Buffer.byteLength(raw, 'utf8') > 72) return { ok: false, error: 'The password is too long (the limit is 72 characters).' };
  if (CTRL.test(raw)) return { ok: false, error: 'The password contains characters that are not allowed.' };
  if (!raw.trim()) return { ok: false, error: 'Enter a real password.' };
  if (new Set(raw).size < 5) return { ok: false, error: 'The password is too repetitive. Use the Generate button.' };
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && raw.toLowerCase().includes(local)) return { ok: false, error: 'The password must not contain the email name.' };
  return { ok: true };
}

const fail = (status, error) => ({ status, body: { error } });
const ok = (extra = {}) => ({ status: 200, body: { ok: true, ...extra } });

// Turn a database refusal into a plain message. (The database already refused: this only chooses the words.)
function dbError(e, what) {
  const msg = String(e?.message || '');
  if (e?.code === '42501') return fail(403, 'You are not allowed to do that.');
  if (/own account/i.test(msg)) return fail(400, 'You cannot do this to your own account.');
  if (/not a staff member|expected role|not allowed here/i.test(msg)) return fail(409, 'That person is not a staff member, so it cannot be done here.');
  console.error('team:', what, 'refused by database:', e?.code || '', msg.slice(0, 120));
  return fail(500, 'Something went wrong. Nothing was changed.');
}

const adminFail = (e, what) => {
  const code = e?.code || '', msg = String(e?.message || '');
  if (code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered|already exists/i.test(msg))
    return fail(409, 'An account with that email already exists. Nothing was changed. If it is an old account, remove it in Supabase first.');
  if (code === 'weak_password') return fail(422, 'Supabase says that password is too weak. Use the Generate button.');
  console.error('team:', what, 'failed at Supabase:', code, e?.status || '');         // never log the password or the request
  return fail(502, 'Supabase could not do that. Please try again.');
};

/**
 * @param asUser   Supabase client that carries the SIGNED-IN ADMIN's token (the database checks admin + two-factor for every call)
 * @param adminApi supabase.auth.admin from the server's secret key
 * @param body     what the browser sent. Roles are never taken from here: the code below decides them.
 */
export async function handleTeamAction({ asUser, adminApi, body }) {
  const action = body?.action;

  if (action === 'create') {
    const e = validateEmail(body.email); if (!e.ok) return fail(422, e.error);
    const p = validatePassword(body.password, e.email); if (!p.ok) return fail(422, p.error);
    const created = await adminApi.createUser({ email: e.email, password: body.password, email_confirm: true });
    if (created.error) return adminFail(created.error, 'create');
    const id = created.data?.user?.id;
    if (!UUID.test(String(id))) { console.error('team: create returned no user id'); return fail(502, 'Supabase could not do that. Please try again.'); }
    const r = await asUser.rpc('team_set_role', { p_user: id, p_from: 'customer', p_to: 'staff' });     // constants, never from the browser
    if (r.error) {
      const del = await adminApi.deleteUser(id);                                                         // do not leave a half-made login behind
      if (del.error) console.error('team: could not roll back new login', id);
      return dbError(r.error, 'create');
    }
    return ok({ id, email: e.email });
  }

  const id = body?.user_id;
  if (!UUID.test(String(id))) return fail(400, 'Invalid request.');

  if (action === 'remove') {
    const r = await asUser.rpc('team_set_role', { p_user: id, p_from: 'staff', p_to: 'customer' });       // access is removed FIRST
    if (r.error) return dbError(r.error, 'remove');
    const del = await adminApi.deleteUser(id);
    if (del.error) { console.error('team: removed access but could not delete login', id); return ok({ warning: 'Their access was removed, but their login could not be deleted. Delete it in Supabase → Authentication → Users.' }); }
    return ok();
  }

  if (action === 'reset_password') {
    const p = validatePassword(body.password, body.email || ''); if (!p.ok) return fail(422, p.error);
    const c = await asUser.rpc('team_check_target', { p_user: id, p_expected_role: 'staff', p_action: 'reset_password' });
    if (c.error) return dbError(c.error, 'reset_password');
    const u = await adminApi.updateUserById(id, { password: body.password });
    if (u.error) return adminFail(u.error, 'reset_password');
    return ok();
  }

  if (action === 'reset_mfa') {
    const c = await asUser.rpc('team_check_target', { p_user: id, p_expected_role: 'staff', p_action: 'reset_mfa' });
    if (c.error) return dbError(c.error, 'reset_mfa');
    const l = await adminApi.mfa.listFactors({ userId: id });
    if (l.error) return adminFail(l.error, 'reset_mfa');
    const factors = l.data?.factors || [];
    for (const f of factors) { const d = await adminApi.mfa.deleteFactor({ id: f.id, userId: id }); if (d.error) return adminFail(d.error, 'reset_mfa'); }
    return ok({ removed: factors.length });
  }

  return fail(400, 'Unknown action.');
}
