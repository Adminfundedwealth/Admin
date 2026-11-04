export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('audit.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const action = params.get('action');
    const entity = params.get('target_entity_type');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const ip = params.get('ip_address');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 100;
    const offset = (page - 1) * pageSize;

    let query = supabase.from('audit_records').select('*', { count: 'exact' });
    if (action) query = query.ilike('action', `%${action}%`);
    if (entity) query = query.eq('target_entity_type', entity);
    if (dateFrom) query = query.gte('timestamp', dateFrom);
    if (dateTo) query = query.lte('timestamp', dateTo + 'T23:59:59.999Z');
    if (ip) query = query.eq('ip_address', ip);
    query = query.order('timestamp', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('Audit query failed:', { code: error.code, message: error.message });
      return NextResponse.json(
        { error: { code: 'AUDIT_QUERY_FAILED', message: 'Audit records are temporarily unavailable' } },
        { status: 500 },
      );
    }
    return NextResponse.json({ data: data || [], meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) } });
  } catch (error) {
    console.error('Audit records request failed:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Audit records are temporarily unavailable' } },
      { status: 500 },
    );
  }
}
