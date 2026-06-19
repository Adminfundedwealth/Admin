import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const symbol = params.get('symbol');
    const direction = params.get('direction');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const pnlMin = params.get('pnl_min');
    const pnlMax = params.get('pnl_max');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '50', 10), 200);
    const offset = (page - 1) * pageSize;

    let query = supabase.from('trades').select('*', { count: 'exact' });
    if (symbol) query = query.ilike('symbol', `%${symbol}%`);
    if (direction) query = query.eq('direction', direction);
    if (dateFrom) query = query.gte('opened_at', dateFrom);
    if (dateTo) query = query.lte('opened_at', dateTo + 'T23:59:59.999Z');
    if (pnlMin) query = query.gte('profit_loss', parseFloat(pnlMin));
    if (pnlMax) query = query.lte('profit_loss', parseFloat(pnlMax));
    query = query.order('opened_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    return NextResponse.json({ data: data || [], meta: { page, pageSize, totalCount: count || 0, totalPages: Math.ceil((count || 0) / pageSize) } });
  } catch { return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 }); }
}
