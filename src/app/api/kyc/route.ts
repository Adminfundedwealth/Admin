export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('kyc.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const overdue = params.get('overdue');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    // Select only confirmed live columns — reviewer_id, overdue, submission_count
    // are in migrations but not yet in the live DB schema.
    let query = supabase
      .from('kyc_submissions')
      .select('id, user_id, status, created_at', { count: 'exact' });

    if (status) query = query.eq('status', status);
    // overdue column not in live schema — skip that filter for now

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/kyc] query error:', error);
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
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    });
  } catch (err) {
    console.error('[GET /api/kyc] unexpected error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch KYC submissions' } },
      { status: 500 }
    );
  }
}
