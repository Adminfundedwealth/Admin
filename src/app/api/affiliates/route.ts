export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * Supabase / PostgREST error codes returned when a table does not exist.
 * PGRST200: schema cache miss (table not found by PostgREST)
 * 42P01:    PostgreSQL undefined_table
 */
const TABLE_NOT_FOUND_CODES = new Set(['PGRST200', '42P01']);

const EMPTY_RESPONSE = (page: number, pageSize: number) =>
  NextResponse.json({
    data: [],
    meta: { page, pageSize, totalCount: 0, totalPages: 0 },
    analytics: {
      totalActive: 0,
      totalSuspended: 0,
      totalCommissionPending: 0,
      totalCommissionPaid: 0,
    },
  });

/**
 * GET /api/affiliates
 * List affiliates with optional status filter and pagination.
 *
 * NOTE: The `affiliates` table is defined in migration 00006 but may not yet
 * exist in all environments. When the table is absent, this endpoint returns
 * an empty-but-valid response (HTTP 200) so the UI shows the empty state
 * rather than an error. Once the migration is applied the real data loads
 * automatically — no code change required.
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
      // Gracefully handle missing table — return empty response so the UI
      // shows the empty state instead of "Failed to load affiliates."
      if (TABLE_NOT_FOUND_CODES.has(error.code) || error.message.includes('does not exist')) {
        console.warn(
          `[affiliates] Table not found in this environment (${error.code}: ${error.message}). ` +
          'Apply migration 00006_affiliates_support_marketing_config.sql to enable this feature.',
        );
        return EMPTY_RESPONSE(page, pageSize);
      }

      // All other Supabase errors — log the real message for diagnostics
      console.error(`[affiliates] Query error (${error.code}): ${error.message}`);
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
          totalActive: all.filter((a) => a.status === 'active').length,
          totalSuspended: all.filter((a) => a.status === 'suspended').length,
          totalCommissionPending: all.reduce((s, a) => s + (a.commission_pending ?? 0), 0),
          totalCommissionPaid: all.reduce((s, a) => s + (a.commission_paid ?? 0), 0),
        };
      }
    } catch (analyticsErr) {
      console.warn('[affiliates] Analytics query failed (non-fatal):', analyticsErr);
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
    console.error('[affiliates] Unexpected error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch affiliates' } },
      { status: 500 },
    );
  }
}
