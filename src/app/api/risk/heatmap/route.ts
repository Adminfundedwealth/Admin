export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/risk/heatmap
 * Returns risk heatmap data: accounts grouped by size tier (x) and drawdown usage % (y).
 *
 * LIVE TABLE CORRECTIONS:
 * - funded_accounts not in schema cache → use challenge_accounts status=passed
 *   challenge_accounts cols: id, initial_balance, current_balance, max_drawdown_pct, daily_loss_limit_pct
 * - risk_alerts not in schema cache → use risk_events
 *   risk_events cols: id, trading_account_id, severity, acknowledged
 * - Auth: custom session (requirePermissionInHandler), not Supabase Auth
 *
 * Grid: 4 size tiers × 4 drawdown bands.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('risk.view');
    if (authError) return authError;

    const supabase = createAdminClient();

    // Use challenge_accounts status=passed as funded proxy
    const { data: accounts } = await supabase
      .from('challenge_accounts')
      .select('id, initial_balance, current_balance, max_drawdown_pct')
      .eq('status', 'passed');

    // risk_events: get trading_account_ids with unacknowledged events
    const { data: alerts } = await supabase
      .from('risk_events')
      .select('trading_account_id')
      .eq('acknowledged', false);

    const atRiskAccountIds = new Set((alerts ?? []).map((a) => a.trading_account_id).filter(Boolean));

    // Size tiers (INR): ≤₹25K, ≤₹50K, ≤₹100K, >₹100K
    // Drawdown bands: 0-25%, 25-50%, 50-75%, 75-100%
    const grid = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];

    for (const account of accounts ?? []) {
      // Size tier column
      const balance = account.initial_balance ?? 0;
      let col: number;
      if (balance <= 25000) col = 0;
      else if (balance <= 50000) col = 1;
      else if (balance <= 100000) col = 2;
      else col = 3;

      // Drawdown band row — derive from current vs initial balance
      const initial = account.initial_balance ?? 1;
      const current = account.current_balance ?? initial;
      const drawdownUsedPct = initial > 0 ? ((initial - current) / initial) * 100 : 0;
      const maxDdPct = account.max_drawdown_pct ?? 10;
      const ddRatio = maxDdPct > 0 ? (drawdownUsedPct / maxDdPct) * 100 : 0;

      let row: number;
      if (ddRatio <= 25) row = 0;
      else if (ddRatio <= 50) row = 1;
      else if (ddRatio <= 75) row = 2;
      else row = 3;

      grid[row][col]++;
    }

    return NextResponse.json({ grid });
  } catch (error) {
    console.error('[Risk Heatmap] Error:', error);
    return NextResponse.json({ grid: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
  }
}
