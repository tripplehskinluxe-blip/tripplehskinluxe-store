import { verifyTransaction } from './paystack.js';
import { settlePayment } from './settlement.js';

// Returns the stock of orders whose 20-minute hold has run out, or whose order was cancelled.
// An expired hold is released ONLY when Paystack says the payment is not coming (failed, abandoned or reversed).
// A pending payment, or no answer from Paystack, keeps the hold. Nothing is released on a guess.
const NOT_COMING = new Set(['failed', 'abandoned', 'reversed']);

export async function releaseExpiredHolds(db, deps = {}) {
  const verify = deps.verify || verifyTransaction;
  const settle = deps.settle || ((ref) => settlePayment(db, ref));
  try {
    const now = new Date().toISOString();
    const { data: due, error } = await db.from('orders').select('id,paystack_reference,status,payment_status')
      .eq('stock_held', true).or(`status.eq.cancelled,hold_expires_at.lt.${now}`).limit(20);
    if (error) return { released: 0, kept: 0, failed: true };
    const release = async (id) => { const r = await db.rpc('release_hold', { p_order: id }); return !r.error && r.data === true; };
    let released = 0, kept = 0;
    for (const o of due || []) {
      if (o.status === 'cancelled') { if (await release(o.id)) released++; continue; }
      try { await settle(o.paystack_reference); } catch { /* checked again below */ }
      const { data: fresh } = await db.from('orders').select('stock_held,payment_status').eq('id', o.id).maybeSingle();
      if (!fresh || !fresh.stock_held || fresh.payment_status === 'paid') continue;   // paid meanwhile, or already released
      const tx = await verify(o.paystack_reference).catch(() => null);
      if (tx && NOT_COMING.has(tx.status)) { if (await release(o.id)) released++; } else kept++;
    }
    return { released, kept, failed: false };
  } catch (e) {
    console.error('stock hold: release check failed', e?.message || e);
    return { released: 0, kept: 0, failed: true };
  }
}
