export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/funded
 * List "funded" accounts — traders who have passed their challenge evaluation.
 *
 * LIVE DB REALITY (verified):
 * - `funded_accounts` table DOES NOT EXIST.
 * - Funded traders are challenge_accounts with status = 'passed' (and passed_at IS NOT NULL).
 * - The `promoted_from` column indicates phase promotion.
 *
 * LIVE challenge_accounts columns:
 *   id, trader_id, type, plan, initial_balance, current_balance, peak_balance,
 *   profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, max_calendar_days,
 *   status, started_at, expires_at, passed_at, failed_at, fail_reason, promoted_from, created_at, updated_at
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('challenges.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    // Query challenge_accounts with status = 'passed' (these are "funded" traders)
    let query = supabase
      .from('challenge_accounts')
      .select('*', { count: 'exact' });

    if (status === 'all' || !status) {
      // Default: show passed accounts (= funded)
      query = query.eq('status', 'passed');
    } else if (status === 'passed' || status === 'funded') {
      query = query.eq('status', 'passed');
    } else {
      // Allow viewing other statuses if explicitly requested
      query = query.eq('status', status);
    }

    query = query.order('passed_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    // Map to funded-like shape using LIVE columns
    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      trader_id: row.trader_id,
      type: row.type,
      plan: row.plan,
      initial_balance: row.initial_balance ?? 0,
      current_balance: row.current_balance ?? 0,
      peak_balance: row.peak_balance ?? 0,
      status: row.status,
      passed_at: row.passed_at || null,
      promoted_from: row.promoted_from || null,
      started_at: row.started_at,
      created_at: row.created_at,
      source_table: 'challenge_accounts',
    }));

    return NextResponse.json({
      data: mapped,
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      source: 'challenge_accounts',
      note: 'funded_accounts table does not exist. Showing challenge_accounts with status=passed.',
    });
  } catch (err) {
    console.error('Funded list error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch funded accounts' } }, { status: 500 });
  }
}
