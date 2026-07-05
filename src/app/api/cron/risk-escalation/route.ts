export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/risk-escalation
 * Escalates unacknowledged risk events older than 15 minutes.
 *
 * LIVE TABLE: risk_events (risk_alerts not in schema cache)
 * risk_events cols: id, severity, acknowledged, created_at, trading_account_id, event_type
 */
export async function GET() {
  const supabase = createAdminClient();
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Find unacknowledged risk events older than 15 minutes
  const { data: staleAlerts } = await supabase
    .from('risk_events')
    .select('id, severity')
    .eq('acknowledged', false)
    .lt('created_at', fifteenMinAgo);

  const severityEscalation: Record<string, string> = {
    info: 'warning',
    warning: 'high',
    low: 'medium',
    medium: 'high',
    high: 'critical',
  };

  let escalated = 0;
  for (const alert of staleAlerts || []) {
    const newSeverity = severityEscalation[alert.severity];
    if (newSeverity && newSeverity !== alert.severity) {
      await supabase
        .from('risk_events')
        .update({ severity: newSeverity })
        .eq('id', alert.id);
      escalated++;
    }
  }

  return NextResponse.json({ success: true, escalated, checked: (staleAlerts || []).length });
}
