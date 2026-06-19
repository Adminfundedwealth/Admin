import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/challenges
 * List challenge accounts with filtering and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const challengeType = params.get('challenge_type');
    const user = params.get('user');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('challenge_accounts')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (challengeType) query = query.ilike('challenge_type', `%${challengeType}%`);
    if (dateFrom) query = query.gte('started_at', dateFrom);
    if (dateTo) query = query.lte('started_at', dateTo + 'T23:59:59.999Z');
    if (user) {
      // Search by user_id or join with users table
      query = query.eq('user_id', user);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count || 0, totalPages: Math.ceil((count || 0) / pageSize) },
    });
  } catch (err) {
    console.error('Challenges list error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch challenges' } }, { status: 500 });
  }
}
