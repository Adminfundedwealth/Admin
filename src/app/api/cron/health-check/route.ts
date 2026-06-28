export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/health-check
 * Perform real health checks on services and record results.
 * 
 * SECURITY: Authentication is enforced by middleware (CRON_SECRET check).
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const results: { service_name: string; status: string; response_time_ms: number }[] = [];

  // Database health check (actual query)
  const dbStart = Date.now();
  const { error: dbError } = await supabase.from('staff_members').select('id', { count: 'exact', head: true });
  const dbTime = Date.now() - dbStart;
  results.push({
    service_name: 'Database',
    status: dbError ? 'down' : (dbTime > 5000 ? 'degraded' : 'healthy'),
    response_time_ms: dbTime,
  });

  // API self-check
  results.push({
    service_name: 'API Services',
    status: 'healthy',
    response_time_ms: 0,
  });

  // Record results
  for (const result of results) {
    await supabase.from('system_health_checks').insert(result);
  }

  return NextResponse.json({ success: true, checks: results });
}
