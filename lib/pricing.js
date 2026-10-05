// Single source of truth for order maths. Runs on the SERVER only; the browser never sets prices.
// The delivery fees and the free-delivery amount come from the saved Settings (admin editable), passed in as `settings`.
export function calcTotals({ items, discount = null, state = 'Lagos', settings }) {
  const s = settings;
  if (!s || !Number.isFinite(s.lagosFee) || !Number.isFinite(s.otherFee) || !Number.isFinite(s.freeThreshold)) throw new Error('delivery settings are required');
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);

  let disc = 0;
  let code = null;
  // "over" the minimum: the order must be strictly above min_order_ngn
  if (discount && discount.active && subtotal > (discount.min_order_ngn || 0)) {
    disc = discount.type === 'percent' ? Math.round((subtotal * discount.value) / 100) : discount.value;
    disc = Math.max(0, Math.min(disc, subtotal)); // never negative, never more than the basket
    code = discount.code;
  }

  const after = subtotal - disc;
  const isLagos = String(state).trim().toLowerCase() === 'lagos';
  const delivery = subtotal === 0 ? 0 : isLagos ? (after >= s.freeThreshold ? 0 : s.lagosFee) : s.otherFee;

  return { subtotal, discount: disc, discountCode: code, delivery, total: after + delivery };
}
