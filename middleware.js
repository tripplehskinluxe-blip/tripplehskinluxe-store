import { NextResponse } from 'next/server';
import { resolveAdminRoute } from './lib/admin-route.js';

export function middleware(req) {
  const r = resolveAdminRoute(req.nextUrl.pathname, process.env.NEXT_PUBLIC_ADMIN_PATH);
  if (r.action === 'block') return new NextResponse('Not Found', { status: 404 });
  if (r.action === 'rewrite') {
    const url = req.nextUrl.clone();
    url.pathname = r.to;
    const res = NextResponse.rewrite(url);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
