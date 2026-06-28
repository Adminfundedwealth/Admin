export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';

/**
 * GET /api/founder/flags
 * Fetch all feature flags from feature_flags table.
 * Reads: feature_flags
 */
export async function GET() {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('Feature flags fetch error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

/**
 * POST /api/founder/flags
 * Create a new feature flag.
 * Writes: feature_flags, audit_records
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, scope, enabled } = body;

    if (!name) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('feature_flags')
      .insert({
        name,
        description: description || null,
        scope: scope || 'global',
        enabled: enabled ?? false,
        created_by: actor.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: { code: 'INSERT_ERROR', message: error.message } }, { status: 500 });
    }

    await auditLogger.log({
      actorId: actor.id,
      actorRole: 'Founder',
      action: 'feature_flag.create',
      targetEntityType: 'feature_flag',
      targetEntityId: data.id,
      newState: { name, scope, enabled } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Feature flag create error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

/**
 * PATCH /api/founder/flags
 * Toggle a feature flag.
 * Writes: feature_flags, audit_records
 */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const body = await request.json();
    const { id, enabled } = body;

    if (!id || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'id and enabled (boolean) required' } }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: prev } = await supabase
      .from('feature_flags')
      .select('name, enabled')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('feature_flags')
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: actor.id })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: { code: 'UPDATE_ERROR', message: error.message } }, { status: 500 });
    }

    await auditLogger.log({
      actorId: actor.id,
      actorRole: 'Founder',
      action: `feature_flag.${enabled ? 'enable' : 'disable'}`,
      targetEntityType: 'feature_flag',
      targetEntityId: id,
      previousState: prev as any,
      newState: { enabled } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ success: true, id, enabled });
  } catch (err) {
    console.error('Feature flag toggle error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
