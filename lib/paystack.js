import crypto from 'node:crypto';

const API = 'https://api.paystack.co';

/** Paystack signs the RAW request body with your secret key (HMAC-SHA512) and sends it in x-paystack-signature. */
export function verifyPaystackSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(String(signature).toLowerCase());
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

async function call(path, init = {}) {
  try {
    const res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    return res.ok && json.status ? json.data : null;
  } catch (e) {
    console.error('paystack call failed', path, e.message);
    return null;
  }
}

export const initializeTransaction = ({ email, amountKobo, reference, callbackUrl, metadata }) =>
  call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ email, amount: amountKobo, reference, callback_url: callbackUrl, currency: 'NGN', metadata }),
  });

export const verifyTransaction = (reference) => call(`/transaction/verify/${encodeURIComponent(reference)}`);
