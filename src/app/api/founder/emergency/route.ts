export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';

/**
 * GET /api/founder/emergency
 * Fetch all emergency control states from system_config table.
 * Reads: system_config (key/value store for system-wide settings)
 */
export async function GET() {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const supabase = createAdminClient();

    const controlKeys = [
      'halt_payouts',
      'halt_trading',
      'lockout_staff',
      'maintenance_mode',
      'disable_registrations',
      'force_kyc',
    ];

    const { data, error } = await supabase
      .from('system_config')
      .select('key, value, updated_at, updated_by')
      .in('key', controlKeys);

    if (error) {
      // If table doesn't exist, return defaults (all inactive)
      return NextResponse.json({
        data: controlKeys.map(key => ({ key, active: false, updatedAt: null, updatedBy: null })),
      });
    }

    const configMap: Record<string, any> = {};
    for (const row of data || []) {
      configMap[row.key] = row;
    }

    const controls = controlKeys.map(key => ({
      key,
      active: configMap[key]?.value === 'true' || configMap[key]?.value === true,
      updatedAt: configMap[key]?.updated_at || null,
      updatedBy: configMap[key]?.updated_by || null,
    }));

    return NextResponse.json({ data: controls });
  } catch (err) {
    console.error('Emergency controls fetch error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

/**
 * POST /api/founder/emergency
 * Toggle an emergency control.
 * Writes: system_config, audit_records
 * Side effects: If lockout_staff → invalidates all non-Founder sessions
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const body = await request.json();
    const { key, active } = body;

    if (!key || typeof active !== 'boolean') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'key and active (boolean) required' } }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Upsert the config value
    const { error } = await supabase
      .from('system_config')
      .upsert({
        key,
        value: String(active),
        updated_at: new Date().toISOString(),
        updated_by: actor.id,
      }, { onConflict: 'key' });

    if (error) {
      return NextResponse.json({ error: { code: 'WRITE_ERROR', message: error.message } }, { status: 500 });
    }

    // Execute side effects
    if (key === 'lockout_staff' && active) {
      // Invalidate all sessions except Founder/Co-Founder
      const { data: founderAssignments } = await supabase
        .from('staff_role_assignments')
        .select('staff_id, roles!inner(name)')
        .in('roles.name', ['Founder', 'Co-Founder']);

      const founderIds = (founderAssignments || []).map((a: any) => a.staff_id);

      if (founderIds.length > 0) {
        await supabase
          .from('staff_sessions')
          .update({ invalidated_at: new Date().toISOString() })
          .is('invalidated_at', null)
          .not('staff_id', 'in', `(${founderIds.join(',')})`);
      }
    }

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: 'Founder',
      action: `emergency.${active ? 'activate' : 'deactivate'}`,
      targetEntityType: 'system_config',
      targetEntityId: key,
      newState: { key, active } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ success: true, key, active });
  } catch (err) {
    console.error('Emergency control toggle error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
