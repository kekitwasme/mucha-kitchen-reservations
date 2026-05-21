import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Performs fast auth gating before requests reach pages and route handlers.
 *
 * This is intentionally only an optimistic cookie check. Staff-only route
 * handlers still verify the Auth.js session before doing sensitive work.
 */
export function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  const isPublicPage =
    pathname.startsWith('/book') ||
    pathname.startsWith('/confirm') ||
    pathname.startsWith('/cancel') ||
    pathname.startsWith('/reschedule') ||
    pathname.startsWith('/complete-booking') ||
    pathname === '/login';

  const isPublicApi =
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/availability') ||
    pathname.startsWith('/api/cron') ||
    (pathname === '/api/tables' && req.method === 'GET') ||
    (pathname.startsWith('/api/tables/') && req.method === 'GET') ||
    (pathname === '/api/payments/setup-intent' && req.method === 'POST') ||
    (pathname === '/api/payments/hold' && req.method === 'POST') ||
    (pathname === '/api/reservations' && req.method === 'POST') ||
    (/^\/api\/reservations\/[^/]+$/.test(pathname) && req.method === 'GET') ||
    (/^\/api\/reservations\/[^/]+\/cancel$/.test(pathname) && req.method === 'POST') ||
    (/^\/api\/reservations\/[^/]+\/reschedule$/.test(pathname) && req.method === 'POST');

  if (isPublicPage || isPublicApi) {
    return NextResponse.next();
  }

  const hasAuthCookie =
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token') ||
    req.cookies.has('next-auth.session-token');

  const isStaffRoute = pathname.startsWith('/staff');
  const isProtectedApi =
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/dashboard') ||
    pathname.startsWith('/api/reservations') ||
    pathname.startsWith('/api/payments') ||
    pathname.startsWith('/api/table-') ||
    pathname.startsWith('/api/tables') ||
    pathname.startsWith('/api/floor-objects');

  if ((isStaffRoute || isProtectedApi) && !hasAuthCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const loginUrl = new URL('/login', nextUrl);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
