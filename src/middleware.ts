import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Next.js Edge Middleware — Admin Route Protection
 * 
 * Implements:
 * 1. Session validation via custom staff_sessions (token cookie)
 * 2. Rate limiting (100 read/min, 30 write/min)
 * 3. RBAC permission enforcement per route
 * 4. CSRF protection on mutating requests
 * 5. Security headers (HSTS)
 * 
 * Auth model: Custom session token stored in `session_token` cookie.
 * Staff login creates a session in `staff_sessions` table.
 * Token is SHA-256 hashed for DB lookup.
 */

const SESSION_COOKIE_NAME = 'session_token';
const CSRF_COOKIE_NAME = '__csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const WRITE_METHODS_CSRF = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Route permission mapping
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/executive': 'revenue.view',
  '/users': 'users.view',
  '/purchases': 'purchases.view',
  '/payments': 'payments.view',
  '/challenges': 'challenges.view',
  '/funded': 'challenges.view',
  '/payouts': 'payouts.view',
  '/kyc': 'kyc.view',
  '/risk': 'risk.view',
  '/trades': 'trades.view',
  '/orders': 'trades.view',
  '/affiliates': 'affiliates.view',
  '/revenue': 'revenue.view',
  '/support': 'support.view',
  '/marketing': 'marketing.view',
  '/certificates': 'certificates.view',
  '/monitoring': 'system.view',
  '/audit': 'audit.view',
  '/staff': 'staff.view',
  '/settings': 'settings.view',
  '/founder': 'staff.view', // Founder pages enforce isFullAccess in their API calls
};

// API route permission mapping
const API_PERMISSIONS: Record<string, string> = {
  '/api/users': 'users.view',
  '/api/purchases': 'purchases.view',
  '/api/payments': 'payments.view',
  '/api/challenges': 'challenges.view',
  '/api/funded': 'challenges.view',
  '/api/payouts': 'payouts.view',
  '/api/kyc': 'kyc.view',
  '/api/risk': 'risk.view',
  '/api/trades': 'trades.view',
  '/api/orders': 'trades.view',
  '/api/affiliates': 'affiliates.view',
  '/api/revenue': 'revenue.view',
  '/api/support': 'support.view',
  '/api/marketing': 'marketing.view',
  '/api/certificates': 'certificates.view',
  '/api/monitoring': 'system.view',
  '/api/audit': 'audit.view',
  '/api/staff': 'staff.view',
  '/api/config': 'settings.view',
  '/api/executive': 'revenue.view',
  '/api/coupons': 'marketing.manage',
  '/api/integration': 'challenges.view',
  '/api/founder': 'staff.view', // Founder routes enforce isFullAccess internally
};

// In-memory rate limiting (fallback when Redis is unavailable)
// Production uses Redis via Upstash — see src/lib/rate-limit/redis-limiter.ts
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMITS = { read: 100, write: 30 };
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function checkRateLimit(staffId: string, method: string): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const type = WRITE_METHODS.includes(method) ? 'write' : 'read';
  const limit = type === 'write' ? RATE_LIMITS.write : RATE_LIMITS.read;
  const key = `${staffId}:${type}`;
  const now = Date.now();

  let bucket = rateLimitMap.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    rateLimitMap.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const resetInSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  return { allowed: bucket.count <= limit, remaining, resetInSeconds };
}

function getRequiredPermission(pathname: string): string | null {
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];
  if (API_PERMISSIONS[pathname]) return API_PERMISSIONS[pathname];

  for (const [route, permission] of Object.entries({ ...ROUTE_PERMISSIONS, ...API_PERMISSIONS })) {
    if (pathname.startsWith(route + '/')) return permission;
  }
  return null;
}

/**
 * SHA-256 hash using Web Crypto API (Edge Runtime compatible).
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Global error handler — NEVER let middleware crash return HTML for API routes
  try {
    return await _middleware(request, pathname);
  } catch (err) {
    console.error('[Middleware] Unhandled error:', err);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Middleware error' } },
        { status: 500 }
      );
    }
    // For page requests, redirect to login as a safe fallback
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    loginUrl.searchParams.set('reason', 'error');
    return NextResponse.redirect(loginUrl);
  }
}

async function _middleware(request: NextRequest, pathname: string) {

  // Cron routes — require CRON_SECRET bearer token
  if (pathname.startsWith('/api/cron')) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Cron not configured' } },
        { status: 403 }
      );
    }
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid cron authentication' } },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Webhook routes — authenticate via their own bearer token (TERMINAL_WEBHOOK_SECRET)
  if (pathname.startsWith('/api/webhooks')) {
    // Webhook handlers verify their own auth via TERMINAL_WEBHOOK_SECRET
    // Skip session-based auth — let the route handler validate
    return NextResponse.next();
  }

  // Auth routes — always accessible (login, 2fa pages)
  if (pathname.startsWith('/login') || pathname.startsWith('/2fa') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Get session token from cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    // No session — redirect to login for pages, 401 for API
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validate session against staff_sessions table
  const tokenHash = await hashToken(token);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: session, error: sessionError } = await supabase
    .from('staff_sessions')
    .select('id, staff_id, last_activity, expires_at, invalidated_at')
    .eq('token_hash', tokenHash)
    .single();

  if (sessionError || !session || session.invalidated_at) {
    // Invalid/expired session
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Session invalid or expired' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Check idle timeout (30 minutes)
  const now = Date.now();
  const lastActivity = new Date(session.last_activity).getTime();
  if (now - lastActivity > 30 * 60 * 1000) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'SESSION_EXPIRED', message: 'Session expired due to inactivity' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    loginUrl.searchParams.set('reason', 'idle');
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Check max age (8 hours)
  const expiresAt = new Date(session.expires_at).getTime();
  if (now > expiresAt) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'SESSION_EXPIRED', message: 'Session expired' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const staffId = session.staff_id;

  // Verify staff account is active
  const { data: staff } = await supabase
    .from('staff_members')
    .select('id, status')
    .eq('id', staffId)
    .single();

  if (!staff || staff.status !== 'active') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'ACCOUNT_DISABLED', message: 'Staff account is not active' } },
        { status: 403 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Rate limiting
  const rateResult = checkRateLimit(staffId, request.method);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Rate limit exceeded. Retry in ${rateResult.resetInSeconds}s`, retryAfter: rateResult.resetInSeconds } },
      { status: 429, headers: { 'Retry-After': rateResult.resetInSeconds.toString() } }
    );
  }

  // Permission checking (RBAC)
  const requiredPermission = getRequiredPermission(pathname);
  if (requiredPermission) {
    const { data: permData } = await supabase
      .from('staff_role_assignments')
      .select(`
        roles!inner (
          name,
          role_permissions!inner (
            permission
          )
        )
      `)
      .eq('staff_id', staffId);

    let hasPermission = false;
    const roleAssignments = permData ?? [];

    for (const assignment of roleAssignments) {
      const role = assignment.roles as unknown as { name: string; role_permissions: { permission: string }[] };
      // Founder/Co-Founder bypass
      if (role.name === 'Founder' || role.name === 'Co-Founder') {
        hasPermission = true;
        break;
      }
      if (role.role_permissions.some((rp) => rp.permission === requiredPermission)) {
        hasPermission = true;
        break;
      }
    }

    if (!hasPermission) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
          { status: 403 }
        );
      }
      const dashUrl = new URL('/executive', request.url);
      dashUrl.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(dashUrl);
    }
  }

  // CSRF protection on mutating requests
  if (WRITE_METHODS_CSRF.includes(request.method.toUpperCase())) {
    // Body size enforcement (1MB limit for API requests)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
      return NextResponse.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1MB limit' } },
        { status: 413 }
      );
    }

    // Skip CSRF for auth endpoints (handled above, but belt-and-suspenders)
    if (!pathname.startsWith('/api/auth') && !pathname.startsWith('/api/cron')) {
      const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
      const headerToken = request.headers.get(CSRF_HEADER_NAME);

      // Require CSRF header on all mutating requests once a session is established.
      // If the cookie token is missing, it means the page hasn't been loaded yet —
      // skip enforcement so the client can navigate and get the token set.
      // If the cookie exists but no header is sent, or they don't match → block.
      if (cookieToken) {
        if (!headerToken || cookieToken !== headerToken) {
          return NextResponse.json(
            { error: { code: 'CSRF_INVALID', message: 'CSRF token missing or mismatched' } },
            { status: 403 }
          );
        }
      }
    }
  }

  // Touch session last_activity (fire-and-forget)
  supabase
    .from('staff_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', session.id)
    .then(() => {});

  // Add rate limit + staff identity headers + security headers
  // IMPORTANT: Pass X-Staff-Id as a REQUEST header so API route handlers can read
  // it via headers() — response.headers only affects the client, not the handler.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Staff-Id', staffId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('X-RateLimit-Remaining', rateResult.remaining.toString());
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Set/refresh CSRF cookie on every page (non-API) request
  if (!pathname.startsWith('/api/')) {
    const existingCsrf = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const csrfToken = existingCsrf || Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Must be readable by JS to send as header
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
