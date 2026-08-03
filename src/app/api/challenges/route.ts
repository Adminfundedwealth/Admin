export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/challenges
 * List challenge accounts with filtering and pagination.
 *
 * LIVE SCHEMA (verified):
 *   challenge_accounts: id, trader_id, type, plan, initial_balance, current_balance, peak_balance,
 *     profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, max_calendar_days,
 *     status, started_at, expires_at, passed_at, failed_at, fail_reason, promoted_from, created_at, updated_at
 *
 * NOTE: Live uses `type` (not `challenge_type`), `trader_id` (not `user_id`).
 *       trader_id references terminal_traders.id, NOT public.users.id.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const challengeType = params.get('challenge_type');
    const plan = params.get('plan');
    const traderId = params.get('trader_id');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('challenge_accounts')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    // Live column is `type` (e.g. "evaluation_phase1"), not `challenge_type`
    if (challengeType) query = query.ilike('type', `%${challengeType}%`);
    if (plan) query = query.ilike('plan', `%${plan}%`);
    if (dateFrom) query = query.gte('started_at', dateFrom);
    if (dateTo) query = query.lte('started_at', dateTo + 'T23:59:59.999Z');
    // Live column is `trader_id` (terminal_traders.id), not `user_id`
    if (traderId) query = query.eq('trader_id', traderId);

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    });
  } catch (err) {
    console.error('Challenges list error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch challenges' } }, { status: 500 });
  }
}
