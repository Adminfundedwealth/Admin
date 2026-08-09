export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/affiliates
 * List affiliates with optional status filter and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('affiliates.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    // Query the correct table: affiliates (not affiliate_clicks)
    let query = supabase
      .from('affiliates')
      .select(
        'id, user_id, name, email, affiliate_code, total_referrals, total_revenue_generated, commission_earned, commission_paid, commission_pending, status, created_at, updated_at',
        { count: 'exact' },
      );

    if (status) query = query.eq('status', status);

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Affiliates query error:', error.message);
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    // Summary analytics — non-fatal if it fails
    let analytics = {
      totalActive: 0,
      totalSuspended: 0,
      totalCommissionPending: 0,
      totalCommissionPaid: 0,
    };

    try {
      const { data: all } = await supabase
        .from('affiliates')
        .select('status, commission_pending, commission_paid');

      if (all) {
        analytics = {
          totalActive: all.filter(a => a.status === 'active').length,
          totalSuspended: all.filter(a => a.status === 'suspended').length,
          totalCommissionPending: all.reduce((s, a) => s + (a.commission_pending ?? 0), 0),
          totalCommissionPaid: all.reduce((s, a) => s + (a.commission_paid ?? 0), 0),
        };
      }
    } catch (analyticsErr) {
      console.warn('Affiliates analytics failed (non-fatal):', analyticsErr);
    }

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        pageSize,
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
      analytics,
    });
  } catch (err) {
    console.error('Affiliates list error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch affiliates' } },
      { status: 500 },
    );
  }
}
