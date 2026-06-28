export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

/**
 * GET /api/staff
 * List all staff members with their roles.
 * Reads: staff_members, staff_role_assignments, roles
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

    const { data: staffList, error } = await supabase
      .from('staff_members')
      .select('id, name, email, status, totp_enabled, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    // Fetch all role assignments in one query
    const staffIds = (staffList || []).map((s: any) => s.id);
    let roleMap: Record<string, { id: string; name: string }[]> = {};

    if (staffIds.length > 0) {
      const { data: assignments } = await supabase
        .from('staff_role_assignments')
        .select('staff_id, roles!inner(id, name)')
        .in('staff_id', staffIds);

      for (const assignment of assignments || []) {
        const role = assignment.roles as unknown as { id: string; name: string };
        if (!roleMap[assignment.staff_id]) roleMap[assignment.staff_id] = [];
        roleMap[assignment.staff_id].push({ id: role.id, name: role.name });
      }
    }

    // Merge roles into staff data
    const data = (staffList || []).map((s: any) => ({
      ...s,
      roles: roleMap[s.id] || [],
    }));

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

const createStaffSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role is required'),
});

/**
 * POST /api/staff
 * Create a new staff member with a temporary password.
 * Writes: staff_members, staff_role_assignments, audit_records
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    // Only Founder/Co-Founder can create staff
    if (!actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only Founder accounts can create staff' } }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message, details: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { name, email, roleIds } = parsed.data;

    // Check for existing email
    const { data: existing } = await supabase
      .from('staff_members')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: { code: 'EMAIL_EXISTS', message: 'A staff member with this email already exists' } },
        { status: 409 }
      );
    }

    // Generate temp password
    const { randomBytes } = await import('crypto');
    const tempPassword = randomBytes(12).toString('base64url');
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Create staff member
    const { data: newStaff, error: createError } = await supabase
      .from('staff_members')
      .insert({
        name,
        email: email.toLowerCase(),
        password_hash: passwordHash,
        status: 'active',
        totp_enabled: false,
        force_password_change: true,
        temp_password_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 72h
        failed_login_attempts: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, name, email, status, created_at')
      .single();

    if (createError || !newStaff) {
      return NextResponse.json(
        { error: { code: 'CREATE_ERROR', message: createError?.message || 'Failed to create staff member' } },
        { status: 500 }
      );
    }

    // Assign roles
    const roleAssignments = roleIds.map((roleId) => ({
      staff_id: newStaff.id,
      role_id: roleId,
      assigned_at: new Date().toISOString(),
    }));

    await supabase.from('staff_role_assignments').insert(roleAssignments);

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'Founder',
      action: 'staff.create',
      targetEntityType: 'staff_member',
      targetEntityId: newStaff.id,
      newState: { name, email, roleIds } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({
      data: newStaff,
      tempPassword,
      expiresIn: '72 hours',
      message: 'Staff member created. Share the temporary password securely. They must set up 2FA on first login.',
    }, { status: 201 });
  } catch (err) {
    console.error('Staff create error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create staff member' } }, { status: 500 });
  }
}
