import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'crypto';

const CSRF_COOKIE_NAME = '__csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_SECRET = process.env.SESSION_SECRET || 'fallback-csrf-secret-change-me';

/**
 * CSRF Protection Module
 * Uses Double-Submit Cookie pattern with HMAC signing.
 * 
 * - On GET requests, sets a signed CSRF cookie.
 * - On mutating requests (POST/PUT/PATCH/DELETE), validates the
 *   X-CSRF-Token header matches the cookie value.
 */

/**
 * Generate a signed CSRF token.
 */
export function generateCSRFToken(): string {
  const payload = randomBytes(32).toString('hex');
  const signature = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

/**
 * Verify a CSRF token signature.
 */
export function verifyCSRFToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expectedSignature = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');
  // Constant-time comparison
  if (signature.length !== expectedSignature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validate CSRF for a mutating request.
 * Returns null if valid, or an error response if invalid.
 */
export function validateCSRF(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();
  
  // Only validate on mutating methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }

  // Skip CSRF for auth endpoints (login/2fa) as they don't have a session yet
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/auth')) {
    return null;
  }

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return NextResponse.json(
      { error: { code: 'CSRF_INVALID', message: 'Missing CSRF token' } },
      { status: 403 }
    );
  }

  // Verify signatures on both tokens
  if (!verifyCSRFToken(cookieToken) || !verifyCSRFToken(headerToken)) {
    return NextResponse.json(
      { error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' } },
      { status: 403 }
    );
  }

  // Verify both tokens match (double-submit)
  if (cookieToken !== headerToken) {
    return NextResponse.json(
      { error: { code: 'CSRF_MISMATCH', message: 'CSRF token mismatch' } },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Set a CSRF cookie on a response (for pages/GET requests).
 */
export function setCSRFCookie(response: NextResponse, request: NextRequest): NextResponse {
  // Only set on page requests (not API GETs)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return response;
  }

  const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (existingToken && verifyCSRFToken(existingToken)) {
    return response; // Token already exists and is valid
  }

  const token = generateCSRFToken();
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JS to send in header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  });

  return response;
}
