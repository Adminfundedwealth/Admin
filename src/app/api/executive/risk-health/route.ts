import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/executive/risk-health
 * Returns risk health summary: accounts at risk, highest severity, capital exposure, breaches today.
 * Uses existing tables: risk_alerts, funded_accounts.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      // All active funded accounts for capital calculation
      supabase
        .from('funded_accounts')
        .select('id, balance, equity')
        .eq('status', 'active'),
    ]);

    const openAlerts = openAlertsRes.data ?? [];

    // Unique accounts at risk
    const uniqueAccounts = new Set(openAlerts.map((a) => a.account_id));
    const accountsAtRisk = uniqueAccounts.size;

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
    const totalDeployed = fundedAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
    const atRiskAccounts = fundedAccounts.filter((a) => uniqueAccounts.has(a.id));
    const capitalAtRisk = atRiskAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
    const capitalExposure = totalDeployed > 0 ? (capitalAtRisk / totalDeployed) * 100 : 0;

    return NextResponse.json({
      accountsAtRisk,
      highestSeverity,
      capitalExposure: Math.round(capitalExposure * 10) / 10,
      breachesToday: breachesTodayRes.count ?? 0,
    });
  } catch (error) {
    console.error('[Executive Risk Health] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
