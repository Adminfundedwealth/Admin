export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import type { AuditRecord } from '@/types/database';

/**
 * GET /api/founder/activity
 * Real-time staff activity feed from audit_records.
 * Reads: audit_records, staff_members
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const filter = params.get('filter') || 'all';
    if (!['all', 'mutations', 'logins', 'exports'].includes(filter)) {
      return NextResponse.json(
        { error: { code: 'INVALID_FILTER', message: 'Unsupported activity filter' } },
        { status: 400 },
      );
    }

    const page = Number(params.get('page') || '1');
    if (!Number.isSafeInteger(page) || page < 1) {
      return NextResponse.json(
        { error: { code: 'INVALID_PAGE', message: 'Page must be a positive integer' } },
        { status: 400 },
      );
    }

    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('audit_records')
      .select('*', { count: 'exact' });

    // Apply filter
    if (filter === 'mutations') {
      query = query.not('action', 'like', 'denied:%')
        .not('action', 'in', '("auth.login","auth.logout","auth.2fa.verify")');
    } else if (filter === 'logins') {
      query = query.in('action', ['auth.login', 'auth.logout', 'auth.2fa.verify', 'auth.login.failed']);
    } else if (filter === 'exports') {
      query = query.like('action', 'data.export%');
    }

    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: records, error, count } = await query;

    if (error) {
      console.error('Founder activity query failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: { code: 'ACTIVITY_QUERY_FAILED', message: 'Activity data is temporarily unavailable' } },
        { status: 500 },
      );
    }

    // Resolve staff names
    const activityRecords = (records || []) as AuditRecord[];
    const actorIds = Array.from(new Set(activityRecords.map((record) => record.actor_id).filter(Boolean)));
    let staffMap: Record<string, { name: string; roles: string[] }> = {};

    if (actorIds.length > 0) {
      const { data: staffMembers, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name')
        .in('id', actorIds);

      const { data: roleData, error: roleError } = await supabase
        .from('staff_role_assignments')
        .select('staff_id, roles!inner(name)')
        .in('staff_id', actorIds);

      const enrichmentError = staffError ?? roleError;
      if (enrichmentError) {
        console.error('Founder activity enrichment failed:', {
          code: enrichmentError.code,
          message: enrichmentError.message,
        });
        return NextResponse.json(
          { error: { code: 'ACTIVITY_ENRICHMENT_FAILED', message: 'Activity data is temporarily unavailable' } },
          { status: 500 },
        );
      }

      for (const s of staffMembers || []) {
        staffMap[s.id] = { name: s.name, roles: [] };
      }
      for (const r of roleData || []) {
        const role = r.roles as unknown as { name: string };
        if (staffMap[r.staff_id]) {
          staffMap[r.staff_id].roles.push(role.name);
        }
      }
    }

    const enriched = activityRecords.map((r) => ({
      id: r.id,
      staffId: r.actor_id,
      staffName: staffMap[r.actor_id]?.name || 'Unknown',
      staffRole: staffMap[r.actor_id]?.roles[0] || r.actor_role || 'Unknown',
      action: r.action,
      targetEntityType: r.target_entity_type,
      targetEntityId: r.target_entity_id,
      ipAddress: r.ip_address,
      timestamp: r.timestamp,
      metadata: r.metadata,
    }));

    return NextResponse.json({
      data: enriched,
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    });
  } catch (err) {
    console.error('Activity feed error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
