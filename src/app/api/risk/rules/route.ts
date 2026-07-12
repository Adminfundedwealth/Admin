export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/risk/rules
 * Returns all trading accounts with their risk_rules rows.
 * Used by the Risk Rules Editor admin page.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('risk.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const planType = params.get('plan') || '';
    const search   = params.get('search') || '';

    // Fetch trading accounts
    let query = supabase
      .from('trading_accounts')
      .select('id, account_code, broker_provider, status, trader_id, challenge_id')
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: accounts, error: acctError } = await query;
    if (acctError) throw new Error(acctError.message);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Fetch challenge accounts to get plan type
    const challengeIds = accounts.map(a => a.challenge_id).filter(Boolean);
    const { data: challenges } = await supabase
      .from('challenge_accounts')
      .select('id, plan, type')
      .in('id', challengeIds);

    const challengeMap = Object.fromEntries((challenges || []).map(c => [c.id, c]));

    // Fetch risk rules for all accounts
    const accountIds = accounts.map(a => a.id);
    const { data: rules, error: rulesError } = await supabase
      .from('risk_rules')
      .select('id, trading_account_id, rule_type, value, is_active, updated_at')
      .in('trading_account_id', accountIds)
      .order('rule_type');

    if (rulesError) throw new Error(rulesError.message);

    // Group rules by account
    const rulesByAccount: Record<string, typeof rules> = {};
    for (const rule of rules || []) {
      if (!rulesByAccount[rule.trading_account_id]) rulesByAccount[rule.trading_account_id] = [];
      rulesByAccount[rule.trading_account_id].push(rule);
    }

    // Build response — filter if needed
    const result = accounts
      .filter(a => {
        const ch = challengeMap[a.challenge_id];
        if (planType && ch?.plan !== planType) return false;
        if (search && !a.account_code.toLowerCase().includes(search.toLowerCase()) && !a.id.includes(search)) return false;
        return true;
      })
      .map(a => {
        const ch = challengeMap[a.challenge_id];
        return {
          accountId: a.id,
          accountCode: a.account_code,
          planType: ch?.plan || 'unknown',
          challengeType: ch?.type || 'unknown',
          status: a.status,
          rules: rulesByAccount[a.id] || [],
        };
      });

    return NextResponse.json({ data: result });
  } catch (err: any) {
    console.error('[API/risk/rules] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
