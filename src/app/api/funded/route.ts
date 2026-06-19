import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/funded
 * List funded accounts with filtering and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const payoutEligible = params.get('payout_eligible');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase.from('funded_accounts').select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (payoutEligible === 'true') query = query.eq('payout_eligible', true);
    if (payoutEligible === 'false') query = query.eq('payout_eligible', false);

    query = query.order('funded_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count || 0, totalPages: Math.ceil((count || 0) / pageSize) },
    });
  } catch (err) {
    console.error('Funded list error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch funded accounts' } }, { status: 500 });
  }
}
