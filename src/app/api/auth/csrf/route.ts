export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const CSRF_COOKIE_NAME = '__csrf_token';

/**
 * GET /api/auth/csrf
 *
 * Returns the current CSRF token from the cookie so client-side code can
 * read it even in environments where document.cookie is unavailable or stale.
 *
 * The middleware sets the __csrf_token cookie on every page (non-API) request.
 * This endpoint lets the client refresh/retrieve the token on demand.
 *
 * Used by apiFetch when the CSRF cookie is missing from document.cookie.
 */
export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!cookieToken) {
    // Token not set yet — middleware will set it on the next page request.
    // Return a 204 so the client knows to retry after navigating to a page.
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ token: cookieToken });
}
