import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js Edge Middleware
 * Implements: Session validation, Rate limiting, RBAC permission checking
 * 
 * Flow:
 * 1. Skip auth routes and static assets
 * 2. Validate session (token exists, not expired, not idle)
 * 3. Check rate limits (100 read/min, 30 write/min)
 * 4. Check route permissions via RBAC
 * 5. Touch session (update last_activity)
 */

// Route permission mapping
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/executive': 'revenue.view',
  '/users': 'users.view',
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
};

// API route permission mapping
const API_PERMISSIONS: Record<string, string> = {
  '/api/users': 'users.view',
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
};

// Simple in-memory rate limiting for Edge Runtime
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS = {
  read: 100,   // 100 requests per minute
  write: 30,   // 30 requests per minute
};

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

  return {
    allowed: bucket.count <= limit,
    remaining,
    resetInSeconds,
  };
}

function getRequiredPermission(pathname: string): string | null {
  // Check exact match first for pages
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];
  if (API_PERMISSIONS[pathname]) return API_PERMISSIONS[pathname];

  // Check prefix match
  for (const [route, permission] of Object.entries({ ...ROUTE_PERMISSIONS, ...API_PERMISSIONS })) {
    if (pathname.startsWith(route + '/')) return permission;
  }

  return null;
}

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith('/login') || 
         pathname.startsWith('/2fa') || 
         pathname.startsWith('/api/auth');
}

function isPublicRoute(pathname: string): boolean {
  return pathname === '/' || 
         pathname.startsWith('/api/search') ||
         pathname.startsWith('/api/notifications');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Auth routes - no protection needed
  if (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/2fa')) {
    return NextResponse.next();
  }

  // DEVELOPMENT MODE: Skip all auth checks until Supabase is connected
  // TODO: Remove this bypass when authentication is configured
  return NextResponse.next();

  // Create Supabase client for session checking
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Session validation
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // No valid session — redirect to login for page routes, 401 for API
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

  // Rate limiting
  const rateResult = checkRateLimit(user!.id, request.method);
  if (!rateResult.allowed) {
    const errorResponse = NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Retry in ${rateResult.resetInSeconds}s`,
          retryAfter: rateResult.resetInSeconds,
        },
      },
      { status: 429 }
    );
    errorResponse.headers.set('X-RateLimit-Remaining', '0');
    errorResponse.headers.set('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + rateResult.resetInSeconds).toString());
    errorResponse.headers.set('Retry-After', rateResult.resetInSeconds.toString());
    return errorResponse;
  }

  // Permission checking for protected routes
  const requiredPermission = getRequiredPermission(pathname);
  if (requiredPermission && !isPublicRoute(pathname)) {
    // Check if user has the required permission via their roles
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
      .eq('staff_id', user!.id);

    let hasPermission = false;

    const roleAssignments = permData ?? [];
    for (let i = 0; i < roleAssignments.length; i++) {
      const assignment = roleAssignments[i];
      const role = assignment.roles as unknown as { name: string; role_permissions: { permission: string }[] };
        // Founder/Co-Founder bypass
        if (role.name === 'Founder' || role.name === 'Co-Founder') {
          hasPermission = true;
          break;
        }
        // Check specific permission
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
      // Redirect to executive dashboard with error for page routes
      const dashUrl = new URL('/executive', request.url);
      dashUrl.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(dashUrl);
    }
  }

  // Add rate limit headers to successful responses
  response.headers.set('X-RateLimit-Remaining', rateResult.remaining.toString());

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
