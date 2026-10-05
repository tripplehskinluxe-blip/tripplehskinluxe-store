// Simple in-memory limiter. Fine as a first line of defence; for production use Upstash/Redis or Vercel's WAF
// because serverless instances do not share memory.
const hits = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const e = hits.get(key) || { n: 0, t: now };
  if (now - e.t > windowMs) { e.n = 0; e.t = now; }
  e.n++;
  hits.set(key, e);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k);
  return e.n <= max;
}

export const getIp = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
