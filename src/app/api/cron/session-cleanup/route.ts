export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/session-cleanup
 * Remove expired and idle sessions.
 * 
 * SECURITY: Authentication is enforced by middleware (CRON_SECRET check).
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  
  // Remove expired sessions
  const { data: expiredData } = await supabase
    .from('staff_sessions')
    .delete()
    .lt('expires_at', now)
    .select('id');
  
  const expiredCount = expiredData?.length || 0;

  // Invalidate idle sessions (30 min)
  const idleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: idleData } = await supabase
    .from('staff_sessions')
    .update({ invalidated_at: now })
    .lt('last_activity', idleCutoff)
    .is('invalidated_at', null)
    .select('id');

  const idleCount = idleData?.length || 0;
  
  return NextResponse.json({
    success: true,
    cleaned: { expired: expiredCount, idle: idleCount },
  });
}
