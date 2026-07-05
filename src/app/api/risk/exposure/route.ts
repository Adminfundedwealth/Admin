export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/risk/exposure
 * Returns capital exposure: capital at risk, total deployed, exposure ratio.
 * Uses existing tables: challenge_accounts (funded_accounts does not exist), risk_alerts.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('risk.view');
    if (authError) return authError;

    const supabase = createAdminClient();

    // funded_accounts does not exist — use challenge_accounts with status=passed as proxy
    const { data: accounts } = await supabase
      .from('challenge_accounts')
      .select('id, current_balance')
      .eq('status', 'passed');

    // risk_alerts not in schema cache → use risk_events (trading_account_id, acknowledged)
    const { data: alerts } = await supabase
      .from('risk_events')
      .select('trading_account_id')
      .eq('acknowledged', false);

    const atRiskAccountIds = new Set((alerts ?? []).map((a: any) => a.trading_account_id).filter(Boolean));
    const allAccounts = accounts ?? [];

    const deployed = allAccounts.reduce((sum, a) => sum + (a.current_balance ?? 0), 0);
    const atRisk = allAccounts
      .filter((a) => atRiskAccountIds.has(a.id))
      .reduce((sum, a) => sum + (a.current_balance ?? 0), 0);
    const ratio = deployed > 0 ? (atRisk / deployed) * 100 : 0;

    return NextResponse.json({
      atRisk: Math.round(atRisk),
      deployed: Math.round(deployed),
      ratio: Math.round(ratio * 10) / 10,
    });
  } catch (error) {
    console.error('[Risk Exposure] Error:', error);
    return NextResponse.json({ atRisk: 0, deployed: 0, ratio: 0 });
  }
}
