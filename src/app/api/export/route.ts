export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/export
 * Initiate data export. Sync for ≤10k records, async for >10k (max 500k).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceCenter, filters } = body;
    const supabase = createAdminClient();
    const staffId = '00000000-0000-0000-0000-000000000000'; // TODO: from session

    // For now, return placeholder response
    // In production: count records, decide sync/async, generate CSV
    const { count } = await supabase.from(sourceCenter === 'users' ? 'users' : sourceCenter === 'trades' ? 'trades' : 'users').select('id', { count: 'exact', head: true });
    const recordCount = count || 0;

    if (recordCount > 500000) {
      return NextResponse.json({ error: { code: 'EXPORT_LIMIT_EXCEEDED', message: 'Export limited to 500,000 records. Please narrow your filters.' } }, { status: 400 });
    }

    // Log export in audit
    await supabase.from('audit_records').insert({
      actor_id: staffId, actor_role: 'staff', action: 'data.export',
      target_entity_type: sourceCenter, target_entity_id: 'export',
      previous_state: null, new_state: { filters, recordCount },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      device_info: { userAgent: request.headers.get('user-agent') || '' },
    });

    if (recordCount <= 10000) {
      // Synchronous — return CSV headers
      return NextResponse.json({ message: 'Export ready', recordCount, type: 'sync' });
    } else {
      // Async — create background job
      await supabase.from('data_exports').insert({
        staff_id: staffId, source_center: sourceCenter, filters,
        record_count: recordCount, status: 'processing',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return NextResponse.json({ message: 'Export processing. You will be notified when ready.', recordCount, type: 'async' }, { status: 202 });
    }
  } catch { return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Export failed' } }, { status: 500 }); }
}
