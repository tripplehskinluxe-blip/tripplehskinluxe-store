// Adds (or updates) one person in the Resend account-wide Contacts list: the current Resend API
// (POST /contacts, email only, no audience id). Used by the newsletter signup and by the order
// confirmation (every real buyer also lands in Contacts for broadcasts). The same email is never
// stored twice: an "already exists" answer from Resend counts as success.
// This must NEVER throw in a way that blocks whatever triggered it (a signup, a payment
// confirmation): it returns a result object and callers log-and-continue.
// (No 'server-only' import on purpose: like email.js, this must also run under plain Node tests.)
export async function addResendContact(email, { firstName } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'not_configured' };
  const clean = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(clean)) return { ok: false, reason: 'invalid_email' };
  try {
    const res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clean, ...(firstName ? { first_name: firstName } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => '');
    if (res.status === 409 || /already exists|duplicate/i.test(detail)) return { ok: true, already: true };
    return { ok: false, reason: `resend ${res.status}: ${detail.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, reason: e?.message || 'network error' };
  }
}
