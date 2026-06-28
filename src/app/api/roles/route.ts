export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

/**
 * GET /api/roles
 * List all roles with their permissions.
 * Requires authentication (defense-in-depth alongside middleware).
 */
export async function GET() {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('roles')
      .select('*, role_permissions(permission)')
      .order('is_system_role', { ascending: false })
      .order('name');

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed' } },
      { status: 500 }
    );
  }
}

const createRoleSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1),
});

/**
 * POST /api/roles
 * Create a new custom role.
 * SECURITY: Requires Founder/Co-Founder access to prevent privilege escalation.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Only Founder/Co-Founder can create roles (privilege escalation prevention)
    if (!actor.isFullAccess) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Only Founder accounts can manage roles' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check max 50 custom roles
    const { count } = await supabase
      .from('roles')
      .select('id', { count: 'exact', head: true })
      .eq('is_system_role', false);

    if ((count || 0) >= 50) {
      return NextResponse.json(
        { error: { code: 'LIMIT_REACHED', message: 'Maximum 50 custom roles allowed' } },
        { status: 400 }
      );
    }

    const { data: role, error } = await supabase
      .from('roles')
      .insert({
        name: parsed.data.name,
        description: parsed.data.description || null,
        is_system_role: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: { code: 'INSERT_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Insert permissions
    const perms = parsed.data.permissions.map(p => ({ role_id: role.id, permission: p }));
    await supabase.from('role_permissions').insert(perms);

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'unknown',
      action: 'role.create',
      targetEntityType: 'role',
      targetEntityId: role.id,
      newState: { name: parsed.data.name, permissions: parsed.data.permissions },
      ipAddress: 'server',
      deviceInfo: { fingerprint: 'server', browser: 'api', os: 'server', ipAddress: 'server' },
    });

    return NextResponse.json({ data: role }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed' } },
      { status: 500 }
    );
  }
}
