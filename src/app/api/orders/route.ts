export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/orders
 * Trading orders (positions) view — reads from trading_accounts-linked data.
 *
 * LIVE DB REALITY:
 * - The shared `orders` table is a COMMERCE table (plan_type, amount, utr_reference).
 *   It does NOT have trading columns (symbol, submitted_at, direction, order_type).
 * - Trading orders live in the Terminal's own tables, not accessible here.
 * - We return trading_accounts as a proxy: each funded trading account IS an active position.
 * - This gives the admin visibility into what accounts are deployed.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('trades.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    // Use trading_accounts (Terminal-owned) as the source of deployed trading positions
    let query = supabase
      .from('trading_accounts')
      .select('id, trader_id, challenge_id, account_code, broker_provider, balance, available_margin, used_margin, status, locked_reason, created_at, updated_at', { count: 'exact' });

    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }
    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      note: 'Trading positions from trading_accounts table (Terminal-owned). Commerce orders are at /api/purchases.',
    });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
