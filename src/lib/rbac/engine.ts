import { createAdminClient } from '@/lib/supabase/admin';
import type { Permission } from '@/types/permissions';
import { FULL_ACCESS_ROLES } from '@/types/permissions';

/**
 * In-memory permission cache with 5-second TTL.
 * Keyed by staffId, stores Set of permissions.
 */
const permissionCache = new Map<string, { permissions: Set<string>; roles: string[]; expiry: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * RBAC Engine - enforces granular permissions across the Admin OS.
 * Implements caching, Founder/Co-Founder bypass, and multi-role union.
 */
export class RBACEngine {
  /**
   * Check if a staff member has a specific permission.
   * Founder/Co-Founder bypass: always returns true.
   */
  async hasPermission(staffId: string, permission: Permission): Promise<boolean> {
    const { permissions, roles } = await this.getStaffPermissionsWithRoles(staffId);

    // Founder/Co-Founder have full unrestricted access
    if (this.isFullAccessRole(roles)) {
      return true;
    }

    return permissions.has(permission);
  }

  /**
   * Check if a staff member has ANY of the given permissions.
   */
  async hasAnyPermission(staffId: string, requiredPermissions: Permission[]): Promise<boolean> {
    const { permissions, roles } = await this.getStaffPermissionsWithRoles(staffId);

    if (this.isFullAccessRole(roles)) {
      return true;
    }

    return requiredPermissions.some((p) => permissions.has(p));
  }

  /**
   * Get all effective permissions for a staff member.
   * Returns the union of all permissions from all assigned roles.
   */
  async getStaffPermissions(staffId: string): Promise<Permission[]> {
    const { permissions } = await this.getStaffPermissionsWithRoles(staffId);
    return Array.from(permissions) as Permission[];
  }

  /**
   * Get all permissions for a specific role.
   */
  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', roleId);

    if (error || !data) return [];
    return data.map((row) => row.permission as Permission);
  }

  /**
   * Get all role names assigned to a staff member.
   */
  async getStaffRoles(staffId: string): Promise<string[]> {
    const { roles } = await this.getStaffPermissionsWithRoles(staffId);
    return roles;
  }

  /**
   * Invalidate the permission cache for a staff member.
   * Called when roles are modified to ensure ≤5s enforcement.
   */
  invalidatePermissionCache(staffId: string): void {
    permissionCache.delete(staffId);
  }

  /**
   * Invalidate all cached permissions (e.g., when a role definition changes).
   */
  invalidateAllCache(): void {
    permissionCache.clear();
  }

  /**
   * Check if a staff member holds a full-access role (Founder or Co-Founder).
   */
  async isStaffFullAccess(staffId: string): Promise<boolean> {
    const { roles } = await this.getStaffPermissionsWithRoles(staffId);
    return this.isFullAccessRole(roles);
  }

  /**
   * Internal: Get permissions and roles for a staff member with caching.
   * Implements multi-role union: if staff has N roles, effective permissions = union of all.
   */
  private async getStaffPermissionsWithRoles(
    staffId: string
  ): Promise<{ permissions: Set<string>; roles: string[] }> {
    // Check cache first
    const cached = permissionCache.get(staffId);
    if (cached && cached.expiry > Date.now()) {
      return { permissions: cached.permissions, roles: cached.roles };
    }

    const supabase = createAdminClient();

    // Fetch all role assignments with role names and permissions in one query
    const { data: assignments, error: assignError } = await supabase
      .from('staff_role_assignments')
      .select(`
        role_id,
        roles!inner (
          name,
          role_permissions (
            permission
          )
        )
      `)
      .eq('staff_id', staffId);

    if (assignError || !assignments) {
      return { permissions: new Set(), roles: [] };
    }

    // Build the union of all permissions from all roles
    const permissions = new Set<string>();
    const roles: string[] = [];

    for (const assignment of assignments) {
      const role = assignment.roles as unknown as { name: string; role_permissions: { permission: string }[] };
      roles.push(role.name);
      for (const rp of role.role_permissions) {
        permissions.add(rp.permission);
      }
    }

    // Cache with 5-second TTL
    permissionCache.set(staffId, {
      permissions,
      roles,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    return { permissions, roles };
  }

  /**
   * Check if any of the role names is a full-access role.
   */
  private isFullAccessRole(roleNames: string[]): boolean {
    const fullAccessNames = ['Founder', 'Co-Founder'];
    return roleNames.some((name) => fullAccessNames.includes(name));
  }
}

/** Singleton instance */
export const rbacEngine = new RBACEngine();
