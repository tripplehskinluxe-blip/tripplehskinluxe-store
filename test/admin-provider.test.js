import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The sign-in screens read the held session (pending.access_token) while the phase is "mfa-verify" / "mfa-enroll".
// If the held session is cleared (setPending(null)) and ANY `await` still runs afterwards, the page draws in between,
// finds no session, and crashes. That is exactly what broke staff sign-in once. Rule: after setPending(null) on the success
// path, nothing is awaited. (An early `return` branch that clears it and leaves is fine.)
export function clearsSessionBeforeAwaiting(finishBody) {
  const BLOCK = '(?:[^{}]|\\{[^{}]*\\})*';   // a block body that may contain one level of { } (e.g. setS({ ... }))
  const withoutEarlyExits = finishBody.replace(new RegExp('\\{' + BLOCK + 'setPending\\(null\\)' + BLOCK + '\\breturn\\b' + BLOCK + '\\}', 'g'), '');
  for (let i = withoutEarlyExits.indexOf('setPending(null)'); i !== -1; i = withoutEarlyExits.indexOf('setPending(null)', i + 1)) {
    if (/\bawait\b/.test(withoutEarlyExits.slice(i))) return true;
  }
  return false;
}

const finishOf = (src) => { const a = src.indexOf('const finish = useCallback('); return src.slice(a, src.indexOf('}, [sb]);', a)); };

test('sign-in: the held session is cleared only after every await, in the same step as the screen switch', () => {
  const src = readFileSync(new URL('../components/admin/AdminProvider.js', import.meta.url), 'utf8');
  assert.ok(src.includes('const finish = useCallback('), 'finish() not found');
  assert.equal(clearsSessionBeforeAwaiting(finishOf(src)), false);
});

test('the guard itself: it flags the version that crashed staff sign-in, and passes the fixed one', () => {
  const crashed = `const finish = useCallback(async (d) => {
    const { error } = await sb.auth.setSession(d.session);
    setPending(null);
    if (error) return setS({ phase: 'signin' });
    let canProducts = d.role === 'admin';
    if (!canProducts) { try { const { data } = await sb.rpc('can_edit_products'); canProducts = data === true; } catch { canProducts = false; } }
    setS({ phase: 'ready', role: d.role, canProducts });
  `;
  const fixed = `const finish = useCallback(async (d) => {
    const { error } = await sb.auth.setSession(d.session);
    if (error) { setPending(null); return setS({ phase: 'signin' }); }
    let canProducts = d.role === 'admin';
    if (!canProducts) { try { const { data } = await sb.rpc('can_edit_products'); canProducts = data === true; } catch { canProducts = false; } }
    setPending(null);
    setS({ phase: 'ready', role: d.role, canProducts });
  `;
  assert.equal(clearsSessionBeforeAwaiting(crashed), true);
  assert.equal(clearsSessionBeforeAwaiting(fixed), false);
});
