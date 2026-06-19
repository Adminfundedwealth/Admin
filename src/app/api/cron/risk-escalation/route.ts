import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  // Find open alerts not acknowledged within 15 minutes
  const { data: staleAlerts } = await supabase.from('risk_alerts')
    .select('id, severity')
    .eq('status', 'open')
    .is('acknowledged_at', null)
    .lt('created_at', fifteenMinAgo);

  const severityEscalation: Record<string, string> = { low: 'medium', medium: 'high', high: 'critical' };

  for (const alert of staleAlerts || []) {
    const newSeverity = severityEscalation[alert.severity] || alert.severity;
    if (newSeverity !== alert.severity) {
      await supabase.from('risk_alerts').update({
        severity: newSeverity,
        original_severity: alert.severity,
        escalated_at: new Date().toISOString(),
      }).eq('id', alert.id);
    }
  }

  return NextResponse.json({ success: true, escalated: (staleAlerts || []).length });
}
