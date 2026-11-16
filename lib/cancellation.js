// What happens around a cancellation and its refund.
// A refund is NEVER sent to Paystack on its own. A paid cancellation waits for a person with the approval permission, and the
// database only lets an APPROVED refund be claimed (refund_claim), so this holds even if some code path forgot to ask.
// The database does the cancelling, the stock and the permission checks; this file does the parts that need Paystack and email.
import * as realMail from './email.js';
import { cancellationEmail, refundEmail, refundDeclinedEmail } from './email.js';
import { createPaystackRefund } from './refund.js';
import { loadSettings, buildSettings } from './settings-core.js';

const COLS = 'id,order_number,customer_name,customer_email,total_ngn,status,payment_status,channel,cancelled_by,delivery_method';

async function settingsForEmail(db) {
  try { return await loadSettings(db); } catch (e) { console.error('email: settings unavailable, using defaults', e.message); return buildSettings([]); }
}

/** Same rule as the database: a customer may cancel until the order is shipped (pickup: until it is ready). */
export function customerCanCancel(o) {
  if (!o || o.channel !== 'online' && !String(o.order_number || '').startsWith('ONL-')) return false;
  if (!['unpaid', 'failed', 'paid'].includes(o.payment_status || 'unpaid')) return false;
  return o.delivery_method === 'pickup' ? ['pending', 'processing'].includes(o.status) : ['pending', 'processing', 'packed'].includes(o.status);
}

/**
 * Asks Paystack for the refund of ONE order, but only if the database says the refund is approved.
 * Returns { state: 'issued' | 'failed' | 'busy' | 'awaiting' (not approved yet) | 'declined' | 'none' }.
 */
export async function refundOrder(db, orderId, { manual = false, actor = null, secret = process.env.PAYSTACK_SECRET_KEY, deps = {} } = {}) {
  const { data: c, error } = await db.rpc('refund_claim', { p_order: orderId, p_manual: manual, p_actor: actor });
  if (error) return { state: 'failed', error: 'database' };
  if (!c?.claimed) {
    if (c?.reason === 'already') {
      if (c.status === 'awaiting_approval') return { state: 'awaiting' };
      if (c.status === 'declined') return { state: 'declined' };
      return { state: ['accepted', 'processed'].includes(c.status) ? 'issued' : c.status === 'processing' ? 'busy' : 'failed' };
    }
    return { state: c?.payment_status === 'refunded' ? 'issued' : 'none' };
  }
  const r = await (deps.refund || createPaystackRefund)({ secret, reference: c.reference, amountKobo: c.amount_kobo, orderNumber: c.order_number });
  const { error: e2 } = await db.rpc('refund_result', { p_order: orderId, p_ok: r.ok, p_paystack_id: r.id || null, p_error: r.ok ? null : r.error });
  if (e2) console.error('refund_result failed', orderId, e2.message);
  return r.ok ? { state: 'issued' } : { state: 'failed', error: r.error };
}

async function sendOnce(db, order, kind, build, mail) {
  if (!mail.emailConfigured() || !order.customer_email) return 'skipped';
  const { data: won, error } = await db.rpc('claim_order_email', { p_order: order.id, p_kind: kind });
  if (error) throw new Error('claim_order_email failed');
  if (!won) return 'already_sent';
  try {
    await mail.sendEmail({ to: order.customer_email, ...build(order, await settingsForEmail(db)) });
    return 'sent';
  } catch (e) {
    await db.rpc('release_order_email', { p_order: order.id, p_kind: kind });
    throw e;
  }
}

/**
 * Called right after an order has been cancelled. It does NOT refund anything: a paid online order is flagged and its refund
 * waits for approval. The customer is emailed ONCE, and the email says the refund is with our team (never "refund issued").
 */
export async function finishCancellation(db, orderId, { mail = realMail } = {}) {
  const { data: o, error } = await db.from('orders').select(COLS).eq('id', orderId).single();
  if (error || !o || o.status !== 'cancelled') throw new Error('order is not cancelled');
  let refund = 'none';
  if (o.channel === 'online' && (o.payment_status === 'paid' || o.payment_status === 'refunded')) refund = o.payment_status === 'refunded' ? 'issued' : 'review';
  let email = 'skipped';
  if (o.channel === 'online') {
    try {
      email = await sendOnce(db, o, 'cancelled', (ord, s) => cancellationEmail(ord, refund, s), mail);
      if (refund === 'issued') await db.rpc('claim_order_email', { p_order: orderId, p_kind: 'refund_issued' });
    } catch (e) { console.error('cancellation email failed', o.order_number, e?.message || e); email = 'failed'; }
  }
  return { refund, email };
}

/** "Your refund has been issued": for a refund that was completed after the first email (approval, retry, or done by hand). */
export async function sendRefundEmailOnce(db, orderId, mail = realMail) {
  const { data: o } = await db.from('orders').select(COLS).eq('id', orderId).single();
  if (!o || o.channel !== 'online' || o.status !== 'cancelled' || o.payment_status !== 'refunded') return 'not_needed';
  return sendOnce(db, o, 'refund_issued', refundEmail, mail);
}

const fail = (error, code) => ({ ok: false, code: error?.code === '42501' ? 'forbidden' : code || 'failed', message: error?.message });

/**
 * Approve a refund, then ask Paystack. The approval runs as the SIGNED-IN person (asUser), so the database checks their permission,
 * their two-factor session and the "not your own request" rule. Only after it says ok does the server claim the refund.
 */
export async function approveRefund(asUser, db, orderId, { mail = realMail, ...opts } = {}) {
  const { data, error } = await asUser.rpc('approve_refund', { p_order: orderId });
  if (error) return fail(error);
  if (data?.code !== 'ok') return { ok: false, code: data?.code || 'failed' };
  const r = await refundOrder(db, orderId, opts);
  let email = 'skipped';
  if (r.state === 'issued') { try { email = await sendRefundEmailOnce(db, orderId, mail); } catch (e) { console.error('refund email failed', e?.message || e); email = 'failed'; } }
  return { ok: true, refund: r.state, error: r.error, email };
}

/** Decline: a customer's cancellation is undone (the order goes back where it was); the customer is told once. */
export async function declineRefund(asUser, db, orderId, note, { mail = realMail } = {}) {
  const { data, error } = await asUser.rpc('decline_refund', { p_order: orderId, p_note: note || null });
  if (error) return fail(error);
  if (data?.code !== 'ok') return { ok: false, code: data?.code || 'failed' };
  let email = 'skipped';
  try {
    const { data: o } = await db.from('orders').select(COLS).eq('id', orderId).single();
    if (o?.channel === 'online') email = await sendOnce(db, o, 'refund_declined', (ord, s) => refundDeclinedEmail(ord, !!data.reinstated, s), mail);
  } catch (e) { console.error('decline email failed', e?.message || e); email = 'failed'; }
  return { ok: true, reinstated: !!data.reinstated, email };
}
