export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';

/**
 * GET /api/auth/me
 * Returns the current authenticated staff member's basic profile.
 * Used by client components that need to check role/permissions (e.g. useIsFounder).
 */
export async function GET() {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  return NextResponse.json({
    data: {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      roles: staff.roles,
      isFullAccess: staff.isFullAccess,
    },
  });
}
