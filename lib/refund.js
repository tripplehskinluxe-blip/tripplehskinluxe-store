// Asks Paystack to give a customer's money back. Paystack only ever refunds up to what the customer paid, so a repeated
// request cannot refund twice; on top of that our database allows ONE refund per order.
// https://paystack.com/docs/payments/refunds/
export async function createPaystackRefund({ secret, reference, amountKobo, orderNumber }, deps = {}) {
  const f = deps.fetch || fetch;
  if (!secret) return { ok: false, error: 'Paystack key is not set' };
  try {
    const res = await f('https://api.paystack.co/refund', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: reference, amount: amountKobo, currency: 'NGN', customer_note: `Refund for order ${orderNumber}`, merchant_note: `Order ${orderNumber} was cancelled` }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.status === true) return { ok: true, state: String(j.data?.status || 'pending'), id: j.data?.id != null ? String(j.data.id) : null };
    return { ok: false, error: String(j.message || `Paystack answered ${res.status}`).slice(0, 300) };
  } catch {
    return { ok: false, error: 'Could not reach Paystack' };
  }
}
