export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});

/**
 * POST /api/staff/[id]/roles
 * Assign a role to a staff member.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const body = await request.json();
    const parsed = assignRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid role ID' } }, { status: 400 });
    }

    const supabase = createAdminClient();
    const staffId = params.id;

    // Verify staff member exists
    const { data: staff } = await supabase.from('staff_members').select('id, name').eq('id', staffId).single();
    if (!staff) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Staff member not found' } }, { status: 404 });
    }

    // Verify role exists
    const { data: role } = await supabase.from('roles').select('id, name').eq('id', parsed.data.roleId).single();
    if (!role) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role not found' } }, { status: 404 });
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from('staff_role_assignments')
      .select('id')
      .eq('staff_id', staffId)
      .eq('role_id', parsed.data.roleId)
      .single();

    if (existing) {
      return NextResponse.json({ error: { code: 'ALREADY_ASSIGNED', message: 'Role already assigned' } }, { status: 409 });
    }

    // Assign role
    const { error } = await supabase
      .from('staff_role_assignments')
      .insert({ staff_id: staffId, role_id: parsed.data.roleId, assigned_at: new Date().toISOString() });

    if (error) {
      return NextResponse.json({ error: { code: 'INSERT_ERROR', message: error.message } }, { status: 500 });
    }

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'staff',
      action: 'staff.role.assign',
      targetEntityType: 'staff_member',
      targetEntityId: staffId,
      newState: { roleId: role.id, roleName: role.name } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ success: true, role: { id: role.id, name: role.name } }, { status: 201 });
  } catch (err) {
    console.error('Role assign error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

/**
 * DELETE /api/staff/[id]/roles
 * Remove a role from a staff member.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const body = await request.json();
    const parsed = assignRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid role ID' } }, { status: 400 });
    }

    const supabase = createAdminClient();
    const staffId = params.id;

    // Get role name for audit
    const { data: role } = await supabase.from('roles').select('id, name').eq('id', parsed.data.roleId).single();

    // Remove assignment
    const { error } = await supabase
      .from('staff_role_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('role_id', parsed.data.roleId);

    if (error) {
      return NextResponse.json({ error: { code: 'DELETE_ERROR', message: error.message } }, { status: 500 });
    }

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'staff',
      action: 'staff.role.remove',
      targetEntityType: 'staff_member',
      targetEntityId: staffId,
      previousState: { roleId: role?.id, roleName: role?.name } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Role remove error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
