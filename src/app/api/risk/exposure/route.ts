export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/risk/exposure
 * Returns capital exposure: capital at risk, total deployed, exposure ratio.
 * Uses existing tables: funded_accounts, risk_alerts.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active funded accounts
    const { data: accounts } = await supabase
      .from('funded_accounts')
      .select('id, balance')
      .eq('status', 'active');

    // Get accounts with open risk alerts
    const { data: alerts } = await supabase
      .from('risk_alerts')
      .select('account_id')
      .eq('status', 'open');

    const atRiskAccountIds = new Set((alerts ?? []).map((a) => a.account_id));
    const allAccounts = accounts ?? [];

    const deployed = allAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
    const atRisk = allAccounts
      .filter((a) => atRiskAccountIds.has(a.id))
      .reduce((sum, a) => sum + (a.balance ?? 0), 0);
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
