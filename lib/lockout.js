// Shared helpers for the escalating lockout stored in the database (login_check / login_failure / login_success in 007).
// Used by the password sign-in, the 6-digit code check and the order-tracking lookup. Plain JS, no Next.js imports.
import crypto from 'node:crypto';
import { ipSubject, lockMessage } from './login-guard.js';

export { ipSubject, lockMessage };
export const hashOf = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const subjectsFor = (prefix, id, ip) => [`${prefix}:${hashOf(id)}`, ipSubject(ip)].filter(Boolean);

/** Is any of these locked right now? -> { until } | { error } (callers must FAIL CLOSED on error) */
export async function lockCheck(db, subjects) {
  const { data, error } = await db.rpc('login_check', { p_subjects: subjects });
  return error ? { error } : { until: data || null };
}
/** Record one failed guess. -> { until } (set when this attempt caused a lock) */
export async function lockFail(db, subjects) {
  const { data, error } = await db.rpc('login_failure', { p_subjects: subjects });
  if (error) console.error('login_failure failed', error.message);
  return { until: data || null };
}
/** A correct answer clears the lock for these subjects (never pass the IP). */
export async function lockClear(db, subjects) {
  const { error } = await db.rpc('login_success', { p_subjects: subjects });
  if (error) console.error('login_success failed', error.message);
}
export const lockedReply = (until, nowMs = Date.now()) => { const m = lockMessage(until, nowMs); return { status: 429, body: { error: m.text, retry_after_seconds: m.secs, locked_until: until } }; };
