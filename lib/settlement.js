// The ONE place that turns a Paystack payment into a paid order.
// Used by: the Railway webhook listener, the Next.js webhook route, and the confirmation-page fallback.
// No Next.js-only imports here, so it also runs in plain Node (Railway). The database client and the Paystack/email
// functions are passed in, which keeps the logic testable without network access.
import { verifyPaystackSignature, verifyTransaction } from './paystack.js';
import * as realMail from './email.js';
import { confirmationEmail, statusEmail } from './email.js';
import { loadSettings, buildSettings } from './settings-core.js';

const REFERENCE = /^ths_[0-9a-f-]{36}$/;
export const isOurReference = (r) => typeof r === 'string' && REFERENCE.test(r);
export const MAX_WEBHOOK_BYTES = 1_000_000;

const ORDER_COLS = 'id,order_number,customer_name,customer_email,address,subtotal_ngn,delivery_ngn,discount_ngn,discount_code,total_ngn,status';

// The shop's current contact details and delivery times for the email text. If they cannot be read, the email still goes out with the defaults.
async function settingsForEmail(db) {
  try { return await loadSettings(db); } catch (e) { console.error('email: settings unavailable, using defaults', e.message); return buildSettings([]); }
}

async function loadForEmail(db, orderId) {
  const { data: order, error } = await db.from('orders').select(ORDER_COLS).eq('id', orderId).single();
  if (error || !order) throw new Error('order not found for email');
  const { data: items, error: ie } = await db.from('order_items').select('name,qty,unit_price_ngn').eq('order_id', orderId);
  if (ie) throw new Error('order items not found for email');
  return { order, items: items || [] };
}

/** Sends the "payment received" email once per order. Returns 'sent' | 'skipped' | 'already_sent' | throws on a send failure. */
export async function sendConfirmationOnce(db, reference, mail = realMail) {
  if (!mail.emailConfigured()) return 'skipped';
  const { data: claim, error } = await db.rpc('claim_confirmation_email', { p_reference: reference });
  if (error) throw new Error('claim_confirmation_email failed');
  if (!claim) return 'already_sent';            // already emailed, or no customer email on the order
  try {
    const { order, items } = await loadForEmail(db, claim.id);
    await mail.sendEmail({ to: order.customer_email, ...confirmationEmail(order, items, await settingsForEmail(db)) });
    return 'sent';
  } catch (e) {
    await db.rpc('release_confirmation_email', { p_order: claim.id });   // let a retry send it
    throw e;
  }
}

/** Sends the shipped / out-for-delivery / delivered email once per status. The status is read from the database, never from the caller. */
export async function sendStatusEmailOnce(db, orderId, mail = realMail) {
  if (!mail.emailConfigured()) return 'skipped';
  const { data: claim, error } = await db.rpc('claim_status_email', { p_order: orderId });
  if (error) throw new Error('claim_status_email failed');
  if (!claim) return 'not_needed';
  try {
    const { order } = await loadForEmail(db, claim.id);
    const msg = statusEmail(order, await settingsForEmail(db));
    if (!msg) { await db.rpc('release_status_email', { p_order: claim.id }); return 'not_needed'; }
    await mail.sendEmail({ to: order.customer_email, ...msg });
    return 'sent';
  } catch (e) {
    await db.rpc('release_status_email', { p_order: claim.id });
    throw e;
  }
}

/**
 * Confirms a payment directly with Paystack, then marks the order paid in one database transaction.
 * Result: { ok: true, outcome } or { ok: false, retry: true, reason } (a retry is worth it: Paystack down, database down, email down).
 */
export async function settlePayment(db, reference, deps = {}) {
  const verify = deps.verify || verifyTransaction;
  const mail = deps.mail || realMail;

  const tx = await verify(reference);
  if (!tx) return { ok: false, retry: true, reason: 'paystack_verify_failed' };
  if (tx.status !== 'success' || tx.currency !== 'NGN') return { ok: true, outcome: 'not_successful' };

  const { data, error } = await db.rpc('mark_order_paid', { p_reference: reference, p_amount_kobo: tx.amount });
  if (error) return { ok: false, retry: true, reason: 'database_error' };

  if (data === 'paid' || data === 'already_paid') {
    // 'already_paid' is included on purpose: if the email failed last time, the retry sends it now.
    try { await sendConfirmationOnce(db, reference, mail); }
    catch (e) { console.error('confirmation email failed', reference, e.message); return { ok: false, retry: true, reason: 'email_failed', outcome: data }; }
  } else {
    // amount_mismatch / paid_stock_issue / paid_cancelled / not_found: a person must look at it. No customer email.
    console.warn('order needs attention', reference, data);
  }
  return { ok: true, outcome: data };
}

/**
 * Handles one Paystack webhook call. Returns { status, body } for the HTTP layer to send.
 * 1) the HMAC-SHA512 signature of the RAW body must match, using the secret key  2) Paystack is asked to confirm the payment
 */
export async function handlePaystackWebhook({ raw, signature, secret, db, deps = {} }) {
  const verifySig = deps.verifySignature || verifyPaystackSignature;
  if (!raw || raw.length > MAX_WEBHOOK_BYTES) return { status: 413, body: 'too large' };
  if (!verifySig(raw, signature, secret)) return { status: 401, body: 'invalid signature' };

  let evt;
  try { evt = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw); } catch { return { status: 400, body: 'bad json' }; }

  if (evt?.event === 'charge.success') {
    const reference = evt.data?.reference;
    if (!isOurReference(reference)) return { status: 200, body: 'ignored' };     // not one of this store's orders
    const client = typeof db === 'function' ? db() : db;       // the database client is only created AFTER the signature checked out
    const r = await settlePayment(client, reference, deps);
    if (!r.ok && r.retry) return { status: 500, body: 'retry' };                  // Paystack will call again
  }
  return { status: 200, body: 'ok' };
}
