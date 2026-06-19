import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/users
 * List/search/filter users with pagination.
 * Search: email, username, user ID, phone, trading account number (min 3 chars, ≤3s)
 * Filters: kyc_status, account_status, date_from, date_to, country
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const search = params.get('search');
    const kycStatus = params.get('kyc_status');
    const accountStatus = params.get('account_status');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const country = params.get('country');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('users')
      .select('id, email, username, first_name, last_name, phone, country, kyc_status, account_status, created_at', { count: 'exact' });

    // Search (partial match, min 3 chars)
    if (search && search.length >= 3) {
      query = query.or(
        `email.ilike.%${search}%,username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,id.eq.${search}`
      );
    }

    // Filters
    if (kycStatus) query = query.eq('kyc_status', kycStatus);
    if (accountStatus) query = query.eq('account_status', accountStatus);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
    if (country) query = query.ilike('country', `%${country}%`);

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        pageSize,
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (err) {
    console.error('Users list error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch users' } },
      { status: 500 }
    );
  }
}
