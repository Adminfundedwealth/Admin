export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/integration/provisioning
 * 
 * Aggregated provisioning status view.
 * Reads from shared provisioning_logs table (Terminal-owned).
 * Does NOT create duplicate tables — reads existing shared data.
 *
 * Query params:
 *   status: pending | processing | completed | failed | retrying
 *   date_from, date_to: ISO date filters
 *   page, page_size: pagination
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('challenges.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('provisioning_logs')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Aggregate stats
    const { data: statsData } = await supabase
      .from('provisioning_logs')
      .select('status');

    const stats = {
      total: (statsData || []).length,
      pending: (statsData || []).filter(r => r.status === 'pending').length,
      processing: (statsData || []).filter(r => r.status === 'processing').length,
      completed: (statsData || []).filter(r => r.status === 'completed').length,
      failed: (statsData || []).filter(r => r.status === 'failed').length,
      retrying: (statsData || []).filter(r => r.status === 'retrying').length,
    };

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      stats,
    });
  } catch (err) {
    console.error('Provisioning list error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch provisioning logs' } },
      { status: 500 }
    );
  }
}
