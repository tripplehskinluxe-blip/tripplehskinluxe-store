// Server-side admin sign-in with an escalating lockout. Plain JS (no Next.js imports) so it can be tested without a server.
// The lock state lives in the database (login_check / login_failure / login_success in 007), keyed by a HASH of the email
// and by the visitor's IP address. Every number (5 tries, 15 min, doubling, 24h cap) comes from the database, not from code.
import crypto from 'node:crypto';

export const emailSubject = (email) => 'e:' + crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
export const ipSubject = (ip) => (ip && ip !== 'unknown' ? 'i:' + String(ip).slice(0, 64) : null);

const GENERIC = 'Incorrect email or password.';

export function lockMessage(untilIso, nowMs = Date.now()) {
  const secs = Math.max(1, Math.ceil((new Date(untilIso).getTime() - nowMs) / 1000));
  const mins = Math.max(1, Math.round(secs / 60));      // nearest minute, so a lock of 15:00 never reads "16 minutes" because of a second of delay
  const h = Math.floor(mins / 60), m = mins % 60;
  const text = mins < 60 ? `${mins} minute${mins === 1 ? '' : 's'}` : `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`;
  return { secs, text: `Too many incorrect attempts. Try again in ${text}.` };
}

/**
 * @param db      Supabase client using the service role key (server only)
 * @param signIn  async (email, password) => { session } | { error: { status } }
 * @returns { status, body } for the HTTP layer
 */
export async function attemptLogin({ db, signIn, email, password, ip, nowMs = Date.now() }) {
  email = String(email ?? '').trim().toLowerCase();
  password = String(password ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !password || password.length > 256)
    return { status: 400, body: { error: 'Enter your email and password.' } };

  const subjects = [emailSubject(email), ipSubject(ip)].filter(Boolean);
  const locked = (until) => { const m = lockMessage(until, nowMs); return { status: 429, body: { error: m.text, retry_after_seconds: m.secs, locked_until: until } }; };

  // 1) Already locked? Then do not even try the password: a CORRECT password during a lock must not work either.
  const { data: until, error: ce } = await db.rpc('login_check', { p_subjects: subjects });
  if (ce) { console.error('login_check failed', ce.message); return { status: 503, body: { error: 'Sign-in is temporarily unavailable. Please try again shortly.' } }; }   // fail CLOSED
  if (until) return locked(until);

  // 2) Try the password with Supabase.
  const r = await signIn(email, password);

  if (r.session) {
    const { error } = await db.rpc('login_success', { p_subjects: [emailSubject(email)] });   // only the email is forgiven, never the IP
    if (error) console.error('login_success failed', error.message);
    return { status: 200, body: { session: { access_token: r.session.access_token, refresh_token: r.session.refresh_token } } };
  }

  const st = r.error?.status ?? 0;
  if (st === 429) return { status: 429, body: { error: 'Too many sign-in attempts. Please wait a few minutes.' } };
  if (st < 400 || st >= 500) return { status: 502, body: { error: 'Sign-in is temporarily unavailable. Please try again shortly.' } };   // Supabase down: not the user's fault, not counted

  // 3) A wrong password (or unknown email: the answer is identical so nobody can probe which emails exist).
  const { data: lockedUntil, error: fe } = await db.rpc('login_failure', { p_subjects: subjects });
  if (fe) console.error('login_failure failed', fe.message);
  if (lockedUntil) return locked(lockedUntil);
  return { status: 401, body: { error: GENERIC } };
}
