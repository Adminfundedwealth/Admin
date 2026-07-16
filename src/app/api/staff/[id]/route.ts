export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

const updateStaffSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'disabled', 'locked']).optional(),
});

/**
 * GET /api/staff/[id]
 * Get a single staff member with their roles.
 * SECURITY: Defense-in-depth auth in handler.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const { id: staffId } = await params;

    const { data: staff, error } = await supabase
      .from('staff_members')
      .select('id, name, email, status, totp_enabled, force_password_change, failed_login_attempts, locked_until, created_at, updated_at')
      .eq('id', staffId)
      .single();

    if (error || !staff) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Staff member not found' } },
        { status: 404 }
      );
    }

    // Fetch role assignments
    const { data: assignments } = await supabase
      .from('staff_role_assignments')
      .select('role_id, assigned_at, roles!inner(id, name, description, is_system_role)')
      .eq('staff_id', staffId);

    const roles = (assignments || []).map((a: any) => {
      // Supabase !inner join returns roles as an array — take first element
      const role = Array.isArray(a.roles) ? a.roles[0] : a.roles;
      return {
        id: role?.id,
        name: role?.name,
        description: role?.description,
        isSystemRole: role?.is_system_role,
        assignedAt: a.assigned_at,
      };
    });

    // Fetch recent login history
    const { data: loginHistory } = await supabase
      .from('login_history')
      .select('ip_address, browser, os, success, is_new_device, created_at')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch active sessions count
    const { count: activeSessions } = await supabase
      .from('staff_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('staff_id', staffId)
      .is('invalidated_at', null)
      .gt('last_activity', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    return NextResponse.json({
      data: {
        ...staff,
        roles,
        loginHistory: loginHistory || [],
        activeSessions: activeSessions || 0,
      },
    });
  } catch (err) {
    console.error('Staff detail error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch staff member' } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/staff/[id]
 * Update a staff member's profile or status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = updateStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { id: staffId } = await params;

    // Fetch current state for audit
    const { data: current } = await supabase
      .from('staff_members')
      .select('id, name, email, status')
      .eq('id', staffId)
      .single();

    if (!current) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Staff member not found' } },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.email) updates.email = parsed.data.email.toLowerCase();
    if (parsed.data.status) updates.status = parsed.data.status;

    const { data: updated, error } = await supabase
      .from('staff_members')
      .update(updates)
      .eq('id', staffId)
      .select('id, name, email, status')
      .single();

    if (error) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // If status changed to disabled or locked, invalidate all sessions
    if (parsed.data.status === 'disabled' || parsed.data.status === 'locked') {
      await supabase
        .from('staff_sessions')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('staff_id', staffId)
        .is('invalidated_at', null);
    }

    // Audit log — non-fatal: don't let a logging failure kill a successful update
    try {
      await auditLogger.log({
        actorId: actor.id,
        actorRole: actor.roles[0] || 'staff',
        action: 'staff.update',
        targetEntityType: 'staff_member',
        targetEntityId: staffId,
        previousState: current as any,
        newState: updated as any,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
        deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Staff update error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update staff member' } },
      { status: 500 }
    );
  }
}
