export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('risk.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const severity = params.get('severity');
    const status = params.get('status');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    // risk_events cols: id, trading_account_id, challenge_id, event_type, severity,
    //   rule_type, threshold_value, actual_value, metadata, acknowledged, created_at
    // NOTE: no 'status' column — use 'acknowledged' boolean instead
    let query = supabase.from('risk_events').select('*', { count: 'exact' });
    if (severity) query = query.eq('severity', severity);
    if (status) {
      // Map status filter: 'open' → acknowledged=false, 'acknowledged' → acknowledged=true
      if (status === 'open') query = query.eq('acknowledged', false);
      else if (status === 'acknowledged') query = query.eq('acknowledged', true);
    }
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
    query = query.order('severity', { ascending: false }).order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    return NextResponse.json({ data: data || [], meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) } });
  } catch { return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 }); }
}
