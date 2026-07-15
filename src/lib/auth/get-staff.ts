import { cookies, headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createHash } from 'crypto';

export const SESSION_COOKIE_NAME = 'session_token';

export interface AuthenticatedStaff {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  isFullAccess: boolean;
}

/**
 * Get the authenticated admin staff member from the current request session.
 * Use in API route handlers (server-side only, NOT edge).
 *
 * Fast path: If middleware already validated the session it sets X-Staff-Id header.
 *            We use that to avoid a redundant DB round-trip.
 * Slow path: Fall back to full cookie → staff_sessions → staff_members lookup.
 *
 * Returns null if not authenticated or session is invalid.
 */
export async function getAuthenticatedStaff(): Promise<AuthenticatedStaff | null> {
  try {
    const supabase = createAdminClient();

    // ── Fast path: middleware already validated session ──────────────────────
    // Middleware sets X-Staff-Id after successful session validation.
    const headerStore = await headers();
    const staffIdFromMiddleware = headerStore.get('x-staff-id');

    if (staffIdFromMiddleware) {
      // Middleware validated — just fetch the staff profile + roles
      const { data: staff } = await supabase
        .from('staff_members')
        .select('id, email, name, status')
        .eq('id', staffIdFromMiddleware)
        .single();

      if (!staff || staff.status !== 'active') return null;

      const { data: assignments } = await supabase
        .from('staff_role_assignments')
        .select(`roles!inner(name, role_permissions(permission))`)
        .eq('staff_id', staff.id);

      const roles: string[] = [];
      const permissionSet = new Set<string>();
      for (const assignment of assignments || []) {
        const role = assignment.roles as unknown as { name: string; role_permissions: { permission: string }[] };
        roles.push(role.name);
        for (const rp of role.role_permissions) permissionSet.add(rp.permission);
      }

      return {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        roles,
        permissions: Array.from(permissionSet),
        isFullAccess: roles.some(r => r === 'Founder' || r === 'Co-Founder'),
      };
    }

    // ── Slow path: full cookie → session → staff lookup ──────────────────────
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) return null;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Validate session
    const { data: session, error } = await supabase
      .from('staff_sessions')
      .select('id, staff_id, last_activity, expires_at, invalidated_at')
      .eq('token_hash', tokenHash)
      .single();

    if (error || !session) return null;

    // Check if invalidated
    if (session.invalidated_at) return null;

    // Check idle timeout (30 minutes)
    const now = Date.now();
    const lastActivity = new Date(session.last_activity).getTime();
    if (now - lastActivity > 30 * 60 * 1000) return null;

    // Check max age (8 hours)
    const expiresAt = new Date(session.expires_at).getTime();
    if (now > expiresAt) return null;

    // Touch session (update last_activity)
    await supabase
      .from('staff_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', session.id);

    // Fetch staff member info
    const { data: staff } = await supabase
      .from('staff_members')
      .select('id, email, name, status')
      .eq('id', session.staff_id)
      .single();

    if (!staff || staff.status !== 'active') return null;

    // Fetch roles and permissions
    const { data: assignments } = await supabase
      .from('staff_role_assignments')
      .select(`
        roles!inner (
          name,
          role_permissions (
            permission
          )
        )
      `)
      .eq('staff_id', staff.id);

    const roles: string[] = [];
    const permissionSet = new Set<string>();

    for (const assignment of assignments || []) {
      const role = assignment.roles as unknown as { name: string; role_permissions: { permission: string }[] };
      roles.push(role.name);
      for (const rp of role.role_permissions) {
        permissionSet.add(rp.permission);
      }
    }

    const isFullAccess = roles.some(r => r === 'Founder' || r === 'Co-Founder');

    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      roles,
      permissions: Array.from(permissionSet),
      isFullAccess,
    };
  } catch (err) {
    console.error('getAuthenticatedStaff error:', err);
    return null;
  }
}

/**
 * Require authentication — returns staff or throws 401 response.
 * Use as guard in API routes.
 */
export async function requireAuth(): Promise<AuthenticatedStaff> {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    throw new Response(
      JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return staff;
}

/**
 * Require a specific permission — returns staff or throws 403 response.
 */
export async function requirePermission(permission: string): Promise<AuthenticatedStaff> {
  const staff = await requireAuth();
  if (staff.isFullAccess) return staff;
  if (!staff.permissions.includes(permission)) {
    throw new Response(
      JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return staff;
}
