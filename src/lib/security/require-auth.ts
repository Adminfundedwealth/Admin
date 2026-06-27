import { NextResponse } from 'next/server';
import { getAuthenticatedStaff, type AuthenticatedStaff } from '@/lib/auth/get-staff';

/**
 * Defense-in-depth authentication guard for API route handlers.
 * Use this in EVERY handler that accesses sensitive data.
 * 
 * Returns the authenticated staff member or an error response.
 */
export async function requireAuthInHandler(): Promise<
  { staff: AuthenticatedStaff; error: null } | { staff: null; error: NextResponse }
> {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return {
      staff: null,
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      ),
    };
  }
  return { staff, error: null };
}

/**
 * Require Founder/Co-Founder access.
 */
export async function requireFounderInHandler(): Promise<
  { staff: AuthenticatedStaff; error: null } | { staff: null; error: NextResponse }
> {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return {
      staff: null,
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      ),
    };
  }
  if (!staff.isFullAccess) {
    return {
      staff: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
        { status: 403 }
      ),
    };
  }
  return { staff, error: null };
}

/**
 * Require a specific permission.
 */
export async function requirePermissionInHandler(
  permission: string
): Promise<{ staff: AuthenticatedStaff; error: null } | { staff: null; error: NextResponse }> {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return {
      staff: null,
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      ),
    };
  }
  if (!staff.isFullAccess && !staff.permissions.includes(permission)) {
    return {
      staff: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      ),
    };
  }
  return { staff, error: null };
}
