import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Lightweight middleware — runs on Edge.
 * Avoids importing auth/Prisma/Zod to stay under 1 MB limit.
 * Auth checks happen inside API routes and pages instead.
 */

export default function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // Public routes that don't require authentication
  const isPublicRoute =
    nextUrl.pathname.startsWith('/book') ||
    nextUrl.pathname.startsWith('/confirm') ||
    nextUrl.pathname.startsWith('/cancel') ||
    nextUrl.pathname.startsWith('/reschedule') ||
    nextUrl.pathname === '/login' ||
    nextUrl.pathname.startsWith('/api/auth') ||
    nextUrl.pathname.startsWith('/api/webhooks') ||
    nextUrl.pathname.startsWith('/api/availability') ||
    nextUrl.pathname.startsWith('/api/tables');

  // POST /api/reservations (customer booking) and POST /api/reservations/*/cancel are public
  const isPublicReservationAction =
    (nextUrl.pathname === '/api/reservations' && req.method === 'POST') ||
    (/^\/api\/reservations\/[^/]+\/cancel$/.test(nextUrl.pathname) && req.method === 'POST') ||
    (/^\/api\/reservations\/[^/]+\/reschedule$/.test(nextUrl.pathname) && req.method === 'POST') ||
    (nextUrl.pathname === '/api/payments/hold' && req.method === 'POST');

  if (isPublicRoute || isPublicReservationAction) {
    return NextResponse.next();
  }

  // For staff routes: check for auth cookie presence (lightweight)
  // Full auth verification happens in API routes / page components
  const hasAuthCookie = req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token') || req.cookies.has('next-auth.session-token');

  const isStaffRoute = nextUrl.pathname.startsWith('/staff');
  const isProtectedApi = nextUrl.pathname.startsWith('/api/admin') ||
    nextUrl.pathname.startsWith('/api/dashboard') ||
    nextUrl.pathname.startsWith('/api/reservations') ||
    nextUrl.pathname.startsWith('/api/table-');

  if ((isStaffRoute || isProtectedApi) && !hasAuthCookie) {
    if (nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const loginUrl = new URL('/login', nextUrl);
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
