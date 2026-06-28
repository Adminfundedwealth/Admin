export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { randomBytes } from 'crypto';

/**
 * POST /api/staff/[id]/reset-password
 * Generate a temporary password for a staff member.
 * The staff member must change it on next login.
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

    // Only Founder/Co-Founder can reset passwords
    if (!actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only Founder accounts can reset passwords' } }, { status: 403 });
    }

    const supabase = createAdminClient();
    const staffId = params.id;

    // Generate temp password
    const tempPassword = randomBytes(12).toString('base64url');

    // Hash password
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Update staff member
    const { error } = await supabase
      .from('staff_members')
      .update({
        password_hash: passwordHash,
        force_password_change: true,
        temp_password_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
        failed_login_attempts: 0,
        locked_until: null,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', staffId);

    if (error) {
      return NextResponse.json({ error: { code: 'UPDATE_ERROR', message: error.message } }, { status: 500 });
    }

    // Invalidate all existing sessions
    await supabase
      .from('staff_sessions')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .is('invalidated_at', null);

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'Founder',
      action: 'staff.password.reset',
      targetEntityType: 'staff_member',
      targetEntityId: staffId,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({
      success: true,
      tempPassword,
      expiresIn: '24 hours',
      message: 'Staff member must change password on next login.',
    });
  } catch (err) {
    console.error('Password reset error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to reset password' } }, { status: 500 });
  }
}
