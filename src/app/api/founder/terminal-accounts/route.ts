export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/founder/terminal-accounts
 * Lists trading accounts with trader info, directly from Supabase.
 * Query params: search, status, page, limit
 */
export async function GET(request: NextRequest) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() || '';
  const status = searchParams.get('status')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = createAdminClient();

    // Build query — join trading_accounts with terminal_traders
    let query = supabase
      .from('trading_accounts')
      .select(
        'id, account_code, balance, status, locked_reason, locked_at, trader_id, terminal_traders!inner(id, email, display_name)',
        { count: 'exact' }
      );

    // Status filter
    if (status) {
      query = query.eq('status', status);
    }

    // Search — filter by trader email or display_name or account_code
    if (search) {
      // Search account_code directly, plus trader fields via a subquery approach
      query = query.or(
        `account_code.ilike.%${search}%,terminal_traders.email.ilike.%${search}%,terminal_traders.display_name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[terminal-accounts] Supabase error:', error);
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    const accounts = (data || []).map((row: any) => ({
      id: row.id,
      account_code: row.account_code,
      balance: row.balance,
      status: row.status,
      locked_reason: row.locked_reason ?? null,
      locked_at: row.locked_at ?? null,
      terminal_traders: row.terminal_traders
        ? {
            email: row.terminal_traders.email,
            display_name: row.terminal_traders.display_name,
          }
        : null,
    }));

    const total = count ?? 0;
    const pages = Math.ceil(total / limit);

    return NextResponse.json({
      accounts,
      pagination: { page, limit, total, pages },
    });
  } catch (err) {
    console.error('[terminal-accounts] Unexpected error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load accounts' } },
      { status: 500 }
    );
  }
}
