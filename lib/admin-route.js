// The admin lives at a secret address (NEXT_PUBLIC_ADMIN_PATH). The real route folder is /internal-admin,
// which is blocked from direct access. If the secret is missing or too short, the admin is switched OFF.
export const INTERNAL = '/internal-admin';
export const MIN_SECRET = 12;

export function resolveAdminRoute(pathname, secret) {
  const s = String(secret || '').replace(/^\/+|\/+$/g, '');
  if (pathname === INTERNAL || pathname.startsWith(INTERNAL + '/')) return { action: 'block' };
  if (s.length >= MIN_SECRET && (pathname === '/' + s || pathname.startsWith('/' + s + '/'))) {
    return { action: 'rewrite', to: INTERNAL + pathname.slice(s.length + 1) };
  }
  return { action: 'next' };
}
