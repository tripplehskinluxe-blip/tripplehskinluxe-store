// The database provider's authenticator (two-factor) calls, made from the SERVER with the person's own login token.
// Plain fetch so it can be tested without a network. Every function returns { data, error: { status, code, message } }.
const base = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;

async function call(method, path, token, body) {
  let res;
  try {
    res = await fetch(base() + path, {
      method, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { return { data: null, error: { status: 0, code: 'network', message: '' } }; }
  let json = null; try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) return { data: null, error: { status: res.status, code: json?.error_code || '', message: json?.msg || json?.message || '' } };
  return { data: json, error: null };
}

export const gotrue = {
  async listFactors(token) { const r = await call('GET', '/user', token); return r.error ? r : { data: { factors: r.data?.factors || [] }, error: null }; },
  deleteFactor: (token, id) => call('DELETE', `/factors/${id}`, token),
  enroll: (token, { issuer, friendlyName }) => call('POST', '/factors', token, { friendly_name: friendlyName, factor_type: 'totp', issuer }),
  challenge: (token, id) => call('POST', `/factors/${id}/challenge`, token, {}),
  verify: (token, id, challengeId, code) => call('POST', `/factors/${id}/verify`, token, { challenge_id: challengeId, code }),
};
