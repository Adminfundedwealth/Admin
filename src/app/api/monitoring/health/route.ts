export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET() {
  try {
    const { error: authError } = await requirePermissionInHandler('system.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('system_health_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(6);

    if (error) {
      console.error('[monitoring/health] Query failed:', error);
      return NextResponse.json(
        { error: 'Failed to fetch system health checks' },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('[monitoring/health] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system health checks' },
      { status: 500 },
    );
  }
}
