export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * GET /api/orders
 * Terminal-owned trading accounts, which are the available source for this view.
 *
 * LIVE DB REALITY:
 * - The shared `orders` table is a COMMERCE table (plan_type, amount, utr_reference).
 *   It does NOT have trading columns (symbol, submitted_at, direction, order_type).
 * - Trading orders live in the Terminal's own tables, not accessible here.
 * - Trading accounts are shown rather than misrepresenting the commerce orders table.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('trades.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status')?.trim() || '';
    const accountCode = params.get('account_code')?.trim() || '';
    const dateFrom = params.get('date_from') || '';
    const dateTo = params.get('date_to') || '';
    const page = Number(params.get('page') ?? '1');
    const pageSize = Number(params.get('page_size') ?? '50');
    if (
      !Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize) ||
      accountCode.length > 100 ||
      (dateFrom && !isDateOnly(dateFrom)) ||
      (dateTo && !isDateOnly(dateTo)) ||
      (dateFrom && dateTo && dateFrom > dateTo)
    ) {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'Invalid trading account filters or pagination.' } },
        { status: 400 },
      );
    }

    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('trading_accounts')
      .select('id, trader_id, challenge_id, account_code, broker_provider, balance, available_margin, used_margin, status, locked_reason, created_at, updated_at', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (accountCode) {
      const escapedAccountCode = accountCode.replace(/[\\%_]/g, '\\$&');
      query = query.ilike('account_code', `%${escapedAccountCode}%`);
    }
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }
    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      note: 'Terminal-owned trading accounts. Commerce orders are available at /api/purchases.',
    });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
