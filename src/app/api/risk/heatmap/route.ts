import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/risk/heatmap
 * Returns risk heatmap data: accounts grouped by size tier (x) and drawdown usage % (y).
 * Uses existing tables: funded_accounts, risk_alerts.
 * Grid: 4 size tiers × 4 drawdown bands.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active funded accounts with their drawdown usage
    const { data: accounts } = await supabase
      .from('funded_accounts')
      .select('id, balance, max_drawdown, current_drawdown')
      .eq('status', 'active');

    // Get accounts with open risk alerts
    const { data: alerts } = await supabase
      .from('risk_alerts')
      .select('account_id')
      .eq('status', 'open');

    const atRiskAccountIds = new Set((alerts ?? []).map((a) => a.account_id));

    // Size tiers: $10K, $25K, $50K, $100K+
    // Drawdown bands: 0-25%, 25-50%, 50-75%, 75-100%
    const grid = [
      [0, 0, 0, 0], // 0-25% drawdown
      [0, 0, 0, 0], // 25-50%
      [0, 0, 0, 0], // 50-75%
      [0, 0, 0, 0], // 75-100%
    ];

    for (const account of accounts ?? []) {
      // Only count accounts that have open risk alerts
      if (!atRiskAccountIds.has(account.id)) continue;

      // Determine size tier column
      const balance = account.balance ?? 0;
      let col: number;
      if (balance <= 15000) col = 0;       // ~$10K tier
      else if (balance <= 35000) col = 1;  // ~$25K tier
      else if (balance <= 75000) col = 2;  // ~$50K tier
      else col = 3;                         // $100K+ tier

      // Determine drawdown band row
      const maxDD = account.max_drawdown ?? 1;
      const currentDD = account.current_drawdown ?? 0;
      const ddPercent = maxDD > 0 ? (currentDD / maxDD) * 100 : 0;

      let row: number;
      if (ddPercent <= 25) row = 0;
      else if (ddPercent <= 50) row = 1;
      else if (ddPercent <= 75) row = 2;
      else row = 3;

      grid[row][col]++;
    }

    return NextResponse.json({ grid });
  } catch (error) {
    console.error('[Risk Heatmap] Error:', error);
    return NextResponse.json({ grid: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]] });
  }
}
