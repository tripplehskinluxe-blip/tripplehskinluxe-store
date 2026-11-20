// Rate limiting. Shared across all serverless instances through Upstash Redis when configured.
// If Redis is missing or unreachable, it falls back to a per-instance limit, so the site keeps working.
// Keys are hashed before they reach Redis, so IP addresses and emails are never stored in readable form.
import crypto from 'node:crypto';

const hits = new Map();

// per-instance fallback (also used by the unit tests)
export function rateLimitLocal(key, max, windowMs) {
  const now = Date.now();
  const e = hits.get(key) || { n: 0, t: now };
  if (now - e.t > windowMs) { e.n = 0; e.t = now; }
  e.n++;
  hits.set(key, e);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k);
  return e.n <= max;
}

// shared limit: one counter per key, shared by every instance. Returns true when the request is allowed.
export async function rateLimit(key, max, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return rateLimitLocal(key, max, windowMs);
  const k = 'rl:' + crypto.createHash('sha256').update(String(key)).digest('hex');
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', k], ['PEXPIRE', k, String(windowMs), 'NX']]),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error(`shared store answered ${res.status}`);
    const out = await res.json();
    const count = out?.[0]?.result;
    if (typeof count !== 'number' || out[0]?.error || out[1]?.error) throw new Error('unexpected shared store reply');
    return count <= max;
  } catch (e) {
    console.error('rate limit: shared store unavailable, using local limit', e?.message || 'unknown error');
    return rateLimitLocal(key, max, windowMs);
  }
}

export const getIp = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
