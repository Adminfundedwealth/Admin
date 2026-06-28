export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/challenges/[id]
 * Full challenge/account detail with provisioning linkage.
 *
 * LIVE SCHEMA (verified):
 *   challenge_accounts: id, trader_id, type, plan, initial_balance, current_balance, peak_balance,
 *     profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, max_calendar_days,
 *     status, started_at, expires_at, passed_at, failed_at, fail_reason, promoted_from, created_at, updated_at
 *   trading_accounts: id, trader_id, challenge_id, account_code, broker_provider, broker_client_id,
 *     broker_credentials_encrypted, balance, available_margin, used_margin, status, locked_reason, created_at, updated_at
 *   provisioning_logs: id, trader_id, trading_account_id, challenge_account_id, order_id, plan,
 *     payment_method, payment_ref, source, status, error_message, started_at, completed_at, created_at
 *   orders: id(text), user_id, amount, account_size, plan_type, status, payment_method, utr_reference, created_at
 *
 * NOTE: challenge_accounts uses `trader_id` (terminal_traders.id), NOT users.id.
 *       challenge_accounts uses `type` and `plan`, NOT `challenge_type`.
 *       trading_accounts uses `challenge_id` to link to challenge_accounts.id.
 *       challenge_timeline does NOT exist.
 *       audit_records does NOT exist.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const accountId = params.id;

    // Try challenge_accounts first
    let account: any = null;
    let accountSource: 'challenge_accounts' | 'trading_accounts' = 'challenge_accounts';

    const { data: challengeData } = await supabase
      .from('challenge_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (challengeData) {
      account = challengeData;
      accountSource = 'challenge_accounts';
    }

    // If not found, try trading_accounts
    if (!account) {
      const { data: tradingData } = await supabase
        .from('trading_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (tradingData) {
        account = tradingData;
        accountSource = 'trading_accounts';
      }
    }

    if (!account) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 });
    }

    // Resolve provisioning linkage via provisioning_logs
    let provisioningLogs: any[] = [];
    if (accountSource === 'challenge_accounts') {
      const { data: provLogs } = await supabase
        .from('provisioning_logs')
        .select('*')
        .eq('challenge_account_id', accountId)
        .order('created_at', { ascending: false });
      provisioningLogs = provLogs || [];
    }

    if (provisioningLogs.length === 0 && accountSource === 'trading_accounts') {
      const { data: provLogs } = await supabase
        .from('provisioning_logs')
        .select('*')
        .eq('trading_account_id', accountId)
        .order('created_at', { ascending: false });
      provisioningLogs = provLogs || [];
    }

    // Determine the originating order ID from provisioning
    const originatingOrderId = provisioningLogs[0]?.order_id || null;

    // Fetch originating order from public.orders (LIVE columns: plan_type not plan)
    let originatingOrder = null;
    if (originatingOrderId) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, user_id, amount, account_size, plan_type, status, payment_method, utr_reference, created_at')
        .eq('id', originatingOrderId)
        .single();
      originatingOrder = orderData;
    }

    // Resolve the linked trading account if we're looking at a challenge
    let linkedTradingAccount = null;
    if (accountSource === 'challenge_accounts') {
      const { data: taData } = await supabase
        .from('trading_accounts')
        .select('id, account_code, broker_provider, balance, available_margin, used_margin, status, created_at')
        .eq('challenge_id', accountId)
        .limit(1);
      if (taData && taData.length > 0) {
        linkedTradingAccount = taData[0];
      }
    }

    // Resolve user info via provisioning → order → user
    let user = null;
    if (originatingOrder?.user_id) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('id', originatingOrder.user_id)
        .single();
      user = userData;
    }

    return NextResponse.json({
      data: {
        account,
        accountSource,
        user: user ? {
          id: user.id,
          email: user.email,
          name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        } : null,
        // Provisioning bridge
        provisioning: provisioningLogs.length > 0 ? {
          status: provisioningLogs[0].status,
          order_id: provisioningLogs[0].order_id,
          error_message: provisioningLogs[0].error_message || null,
          logs: provisioningLogs,
        } : null,
        // Originating order (LIVE column names)
        originatingOrder: originatingOrder ? {
          id: originatingOrder.id,
          user_id: originatingOrder.user_id,
          plan_type: originatingOrder.plan_type,
          amount: originatingOrder.amount,
          account_size: originatingOrder.account_size,
          status: originatingOrder.status,
          payment_method: originatingOrder.payment_method,
          created_at: originatingOrder.created_at,
        } : null,
        // Linked trading account (if viewing a challenge)
        linkedTradingAccount,
      },
    });
  } catch (err) {
    console.error('Challenge detail error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch challenge' } }, { status: 500 });
  }
}
