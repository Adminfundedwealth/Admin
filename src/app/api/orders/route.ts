import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('trades.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const symbol = params.get('symbol');
    const orderType = params.get('order_type');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    let query = supabase.from('orders').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (symbol) query = query.ilike('symbol', `%${symbol}%`);
    if (orderType) query = query.eq('order_type', orderType);
    if (dateFrom) query = query.gte('submitted_at', dateFrom);
    if (dateTo) query = query.lte('submitted_at', dateTo + 'T23:59:59.999Z');
    query = query.order('submitted_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    return NextResponse.json({ data: data || [], meta: { page, pageSize, totalCount: count || 0, totalPages: Math.ceil((count || 0) / pageSize) } });
  } catch { return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 }); }
}
