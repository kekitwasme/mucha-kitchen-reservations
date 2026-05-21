import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Resolve the current staff session for a route handler.
 *
 * Proxy only performs a quick cookie presence check, so sensitive API routes
 * call this helper before doing work that reads or mutates staff-only data.
 */
export async function requireStaffSession() {
  const session = await auth();

  if (!session?.user?.restaurantId) {
    return {
      session: null,
      response: NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    };
  }

  return { session, response: null };
}
