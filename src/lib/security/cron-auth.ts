import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron endpoint authentication.
 * Verifies that cron requests are from an authorized source.
 * 
 * Supports:
 * - CRON_SECRET header verification (for Vercel Cron, external schedulers)
 * - Localhost bypass for development
 */

const CRON_SECRET_HEADER = 'authorization';

/**
 * Validate that a cron request is authorized.
 * Returns null if authorized, or an error response if not.
 */
export function validateCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '') {
      return null; // Allow in dev
    }
  }

  if (!cronSecret) {
    // If no CRON_SECRET is configured, reject all cron requests in production
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Cron authentication not configured' } },
      { status: 403 }
    );
  }

  const authHeader = request.headers.get(CRON_SECRET_HEADER);
  const expectedValue = `Bearer ${cronSecret}`;

  if (!authHeader || authHeader !== expectedValue) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid cron authentication' } },
      { status: 401 }
    );
  }

  return null; // Authorized
}
