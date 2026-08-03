export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/trades
 * Trade history view.
 *
 * LIVE DB REALITY:
 * - `public.trades` table does NOT exist in the shared schema.
 * - Individual trade records are managed by the Terminal's internal MT/cTrader engine,
 *   not exposed in the shared Supabase database.
 * - We surface challenge_accounts as the closest available performance proxy,
 *   showing each account's balance movement (initial → current = implicit P&L).
 * - Filtering by status, date, and plan type is supported.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('trades.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const plan = params.get('plan');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '50', 10), 200);
    const offset = (page - 1) * pageSize;

    // challenge_accounts is the closest available trade-performance table
    let query = supabase
      .from('challenge_accounts')
      .select('id, trader_id, type, plan, initial_balance, current_balance, peak_balance, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, status, started_at, passed_at, failed_at, fail_reason, created_at, updated_at', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (plan) query = query.ilike('plan', `%${plan}%`);
    if (dateFrom) query = query.gte('started_at', dateFrom);
    if (dateTo) query = query.lte('started_at', dateTo + 'T23:59:59.999Z');
    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    // Augment with implicit P&L from balance data
    const mapped = (data || []).map((row: any) => ({
      ...row,
      pnl: (row.current_balance ?? 0) - (row.initial_balance ?? 0),
      pnl_pct: row.initial_balance > 0
        ? (((row.current_balance ?? 0) - row.initial_balance) / row.initial_balance) * 100
        : 0,
    }));

    return NextResponse.json({
      data: mapped,
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      note: 'public.trades table does not exist. Showing challenge_accounts with P&L derived from balance data.',
    });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
