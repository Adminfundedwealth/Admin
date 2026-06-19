import { rbacEngine } from './engine';
import type { Permission } from '@/types/permissions';
import { ROUTE_PERMISSIONS } from '@/config/permissions';

/**
 * Get the required permission for a given route path.
 * Returns null if the route doesn't require a specific permission.
 */
export function getRoutePermission(pathname: string): Permission | null {
  // Check exact match first
  if (ROUTE_PERMISSIONS[pathname]) {
    return ROUTE_PERMISSIONS[pathname];
  }

  // Check prefix match (e.g., /users/[id] → /users)
  for (const [route, permission] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(route + '/') || pathname === route) {
      return permission;
    }
  }

  return null;
}

/**
 * Check if a staff member has permission to access a route.
 * Returns true if permitted, false if denied.
 */
export async function checkRoutePermission(
  staffId: string,
  pathname: string
): Promise<boolean> {
  const requiredPermission = getRoutePermission(pathname);

  // No permission required for this route
  if (!requiredPermission) {
    return true;
  }

  return rbacEngine.hasPermission(staffId, requiredPermission);
}

/**
 * Utility to check permission for API actions.
 * Throws if permission is denied (for use in server actions/route handlers).
 */
export async function requirePermission(
  staffId: string,
  permission: Permission
): Promise<void> {
  const hasAccess = await rbacEngine.hasPermission(staffId, permission);
  if (!hasAccess) {
    throw new PermissionDeniedError(permission);
  }
}

export class PermissionDeniedError extends Error {
  public permission: Permission;

  constructor(permission: Permission) {
    super(`Permission denied: ${permission}`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
  }
}
