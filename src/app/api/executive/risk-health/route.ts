export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/executive/risk-health
 * Returns risk health summary: accounts at risk, highest severity, capital exposure, breaches today.
 *
 * LIVE TABLE CORRECTIONS:
 * - risk_alerts not in schema cache → use risk_events
 *   risk_events cols: id, trading_account_id, challenge_id, event_type, severity, acknowledged, created_at
 * - funded_accounts not in schema cache → use challenge_accounts status=passed
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [openAlertsRes, breachesTodayRes, fundedRes] = await Promise.all([
      supabase
        .from('risk_events')
        .select('id, severity, trading_account_id')
        .eq('acknowledged', false),
      supabase
        .from('risk_events')
        .select('id', { count: 'exact', head: true })
        .eq('acknowledged', false)
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('challenge_accounts')
        .select('id, initial_balance, current_balance')
        .eq('status', 'passed'),
    ]);

    const openAlerts = openAlertsRes.data ?? [];

    // Unique trading accounts with open risk events
    const uniqueAccountIds = new Set<string>();
    for (const alert of openAlerts) {
      if (alert.trading_account_id) uniqueAccountIds.add(alert.trading_account_id);
    }
    const accountsAtRisk = uniqueAccountIds.size;

    // Highest severity
    const severityOrder = ['critical', 'high', 'medium', 'low', 'warning', 'info'];
    let highestSeverity = 'none';
    for (const level of severityOrder) {
      if (openAlerts.some((a) => a.severity === level)) {
        highestSeverity = level;
        break;
      }
    }

    // Capital exposure: passed challenge_accounts as funded proxy
    const fundedAccounts = fundedRes.data ?? [];
    const totalDeployed = fundedAccounts.reduce((sum: number, a: any) => sum + (a.initial_balance ?? 0), 0);
    const capitalAtRisk = fundedAccounts
      .filter((a: any) => uniqueAccountIds.has(a.id))
      .reduce((sum: number, a: any) => sum + (a.initial_balance ?? 0), 0);
    const capitalExposure = totalDeployed > 0 ? (capitalAtRisk / totalDeployed) * 100 : 0;

    return NextResponse.json({
      accountsAtRisk,
      highestSeverity,
      capitalExposure: Math.round(capitalExposure * 10) / 10,
      breachesToday: breachesTodayRes.count ?? 0,
    });
  } catch (error) {
    console.error('[Executive Risk Health] Error:', error);
    return NextResponse.json({ accountsAtRisk: 0, highestSeverity: 'none', capitalExposure: 0, breachesToday: 0 });
  }
}
