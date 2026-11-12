export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { CSRF_HEADER_NAME } from '@/lib/security/csrf';

/**
 * GET /api/auth/csrf
 *
 * The authenticated middleware creates the token from the current session and
 * passes it to this handler in a request header.
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get(CSRF_HEADER_NAME);
  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authenticated session required' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' } },
  );
}
