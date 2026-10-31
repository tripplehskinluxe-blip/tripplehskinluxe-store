// What happens after an order is cancelled: refund the money (paid online orders only) and tell the customer.
// The database does the cancelling and the stock; this file does the parts that need Paystack and email.
import * as realMail from './email.js';
import { cancellationEmail, refundEmail } from './email.js';
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

/** Asks Paystack for the refund of ONE cancelled, paid order. Returns { state: 'issued' | 'failed' | 'busy' | 'none' }. */
export async function refundOrder(db, orderId, { manual = false, secret = process.env.PAYSTACK_SECRET_KEY, deps = {} } = {}) {
  const { data: c, error } = await db.rpc('refund_claim', { p_order: orderId, p_manual: manual });
  if (error) return { state: 'failed', error: 'database' };
  if (!c?.claimed) {
    if (c?.reason === 'already') return { state: ['accepted', 'processed'].includes(c.status) ? 'issued' : c.status === 'processing' ? 'busy' : 'failed' };
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
 * Called right after an order has been cancelled. Refunds a paid online order, then emails the customer ONCE:
 * "refund issued" only if Paystack really accepted it, otherwise "we are refunding it" (and the refund email follows later).
 */
export async function finishCancellation(db, orderId, { mail = realMail, ...opts } = {}) {
  const { data: o, error } = await db.from('orders').select(COLS).eq('id', orderId).single();
  if (error || !o || o.status !== 'cancelled') throw new Error('order is not cancelled');
  let refund = 'none';
  if (o.channel === 'online' && (o.payment_status === 'paid' || o.payment_status === 'refunded')) {
    const r = o.payment_status === 'refunded' ? { state: 'issued' } : await refundOrder(db, orderId, opts);
    refund = r.state === 'issued' ? 'issued' : 'pending';
  }
  let email = 'skipped';
  if (o.channel === 'online') {
    try {
      email = await sendOnce(db, o, 'cancelled', (ord, s) => cancellationEmail(ord, refund, s), mail);
      if (refund === 'issued') await db.rpc('claim_order_email', { p_order: orderId, p_kind: 'refund_issued' });   // this email already said so
    } catch (e) { console.error('cancellation email failed', o.order_number, e?.message || e); email = 'failed'; }
  }
  return { refund, email };
}

/** "Your refund has been issued": for a refund that was completed after the first email (retry, or done by hand). */
export async function sendRefundEmailOnce(db, orderId, mail = realMail) {
  const { data: o } = await db.from('orders').select(COLS).eq('id', orderId).single();
  if (!o || o.channel !== 'online' || o.status !== 'cancelled' || o.payment_status !== 'refunded') return 'not_needed';
  return sendOnce(db, o, 'refund_issued', refundEmail, mail);
}
