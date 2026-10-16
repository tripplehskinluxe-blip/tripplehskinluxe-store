// Two-factor sign-in, done on the SERVER. The 6-digit code check has the same escalating lockout as the password
// (5 wrong codes -> 15 min, then 30, 60 ...), stored in the database. Plain JS so it can be tested without a server.
//   gotrue = the authenticator calls (lib/gotrue.js)   db = service client (for the lock functions)   issuer = shop name, chosen by the server
import { lockCheck, lockFail, lockClear, lockedReply, subjectsFor } from './lockout.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, error) => ({ status, body: { error } });
const ok = (extra = {}) => ({ status: 200, body: { ok: true, ...extra } });
const DOWN = 'Sign-in is temporarily unavailable. Please try again shortly.';

/**
 * @param role  the person's role from the database ('admin' | 'staff' | anything else = not on the team)
 * @param body  what the browser sent: { action: 'status' | 'enroll' | 'verify', factor_id?, code? }
 */
export async function handleMfa({ db, gotrue, user, role, token, ip, issuer, body, nowMs = Date.now() }) {
  if (!['admin', 'staff'].includes(role)) return fail(403, 'This account is not part of the team.');
  const action = body?.action;
  if (!['status', 'enroll', 'verify'].includes(action)) return fail(400, 'Unknown action.');

  const list = await gotrue.listFactors(token);
  if (list.error) return list.error.status === 401 ? fail(401, 'Your session has ended. Sign in again.') : fail(502, DOWN);
  const totp = list.data.factors.filter((f) => f.factor_type === 'totp');
  const verified = totp.find((f) => f.status === 'verified');

  if (action === 'status') return ok({ next: verified ? 'verify' : 'enroll', factor_id: verified?.id ?? null });

  if (action === 'enroll') {
    // Someone who only has the password must never be able to add THEIR authenticator next to the real one.
    if (verified) return fail(409, 'Two-factor is already set up on this account. Ask the shop owner to reset it.');
    for (const f of totp) await gotrue.deleteFactor(token, f.id);                    // clear half-finished set-ups
    const r = await gotrue.enroll(token, { issuer, friendlyName: `${issuer} ${nowMs}` });
    const qr = r.data?.totp?.qr_code, secret = r.data?.totp?.secret;
    if (r.error || !r.data?.id || !qr || !secret) { console.error('mfa enroll failed', r.error?.status, r.error?.code); return fail(502, DOWN); }
    return ok({ factor_id: r.data.id, qr_code: `data:image/svg+xml;utf-8,${qr}`, secret });
  }

  // ---- verify: this is the step that can be guessed, so it is locked ----
  const factorId = String(body.factor_id ?? '');
  const code = String(body.code ?? '').replace(/\s/g, '');
  if (!UUID.test(factorId) || !totp.some((f) => f.id === factorId)) return fail(400, 'Invalid request.');
  if (!/^\d{6}$/.test(code)) return fail(400, 'Enter the 6-digit code from your app.');

  const subjects = subjectsFor('m', user.id, ip);
  const c = await lockCheck(db, subjects);
  if (c.error) { console.error('lock check failed', c.error.message); return fail(503, DOWN); }      // fail CLOSED
  if (c.until) return lockedReply(c.until, nowMs);                                                      // even the RIGHT code is refused during a lock

  const ch = await gotrue.challenge(token, factorId);
  if (ch.error) return ch.error.status === 0 || ch.error.status >= 500 ? fail(502, DOWN) : fail(400, 'Could not start the check. Try again.');
  const v = await gotrue.verify(token, factorId, ch.data?.id, code);
  if (v.error) {
    const st = v.error.status;
    if (st === 429) return fail(429, 'Too many attempts. Please wait a few minutes.');
    if (st === 0 || st >= 500) return fail(502, DOWN);                                               // an outage is not counted against the person
    const f = await lockFail(db, subjects);
    return f.until ? lockedReply(f.until, nowMs) : fail(401, 'That code is not right. Use the newest code from your app.');
  }
  await lockClear(db, [subjects[0]]);                                                                    // only this person's counter, never the IP's
  const s = v.data;
  if (!s?.access_token || !s?.refresh_token) return fail(502, DOWN);
  return ok({ session: { access_token: s.access_token, refresh_token: s.refresh_token }, role });
}
