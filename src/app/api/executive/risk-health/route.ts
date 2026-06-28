export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/risk-health
 * Returns risk health summary: accounts at risk, highest severity, capital exposure, breaches today.
 * Reads: risk_alerts, challenge_accounts (status='passed' as funded proxy)
 * Auth: Handled by middleware (session_token cookie)
 *
 * NOTE: funded_accounts table does not exist. Using challenge_accounts with status='passed'.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [openAlertsRes, breachesTodayRes, fundedRes] = await Promise.all([
      // All open risk alerts
      supabase
        .from('risk_alerts')
        .select('id, severity, account_id')
        .eq('status', 'open'),
      // Breaches created today
      supabase
        .from('risk_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .gte('created_at', todayStart.toISOString()),
      // All "funded" accounts (challenge_accounts with status=passed)
      supabase
        .from('challenge_accounts')
        .select('id, initial_balance, current_balance')
        .eq('status', 'passed'),
    ]);

    const openAlerts = openAlertsRes.data ?? [];

    // Unique accounts at risk
    const uniqueAccountIds = new Set<string>();
    for (const alert of openAlerts) {
      if (alert.account_id) uniqueAccountIds.add(alert.account_id);
    }
    const accountsAtRisk = uniqueAccountIds.size;

    // Highest severity
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    let highestSeverity = 'none';
    for (const level of severityOrder) {
      if (openAlerts.some((a) => a.severity === level)) {
        highestSeverity = level;
        break;
      }
    }

    // Capital exposure calculation
    const fundedAccounts = fundedRes.data ?? [];
    const totalDeployed = fundedAccounts.reduce((sum: number, a: any) => sum + (a.initial_balance ?? 0), 0);
    const atRiskAccounts = fundedAccounts.filter((a: any) => uniqueAccountIds.has(a.id));
    const capitalAtRisk = atRiskAccounts.reduce((sum: number, a: any) => sum + (a.initial_balance ?? 0), 0);
    const capitalExposure = totalDeployed > 0 ? (capitalAtRisk / totalDeployed) * 100 : 0;

    return NextResponse.json({
      accountsAtRisk,
      highestSeverity,
      capitalExposure: Math.round(capitalExposure * 10) / 10,
      breachesToday: breachesTodayRes.count ?? 0,
    });
  } catch (error) {
    console.error('[Executive Risk Health] Error:', error);
    return NextResponse.json({
      accountsAtRisk: 0,
      highestSeverity: 'none',
      capitalExposure: 0,
      breachesToday: 0,
    });
  }
}
