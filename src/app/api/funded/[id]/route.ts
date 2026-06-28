export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/funded/[id]
 * Full funded account detail.
 *
 * LIVE DB REALITY (verified):
 * - `funded_accounts` DOES NOT EXIST.
 * - Look up in challenge_accounts first (terminal-owned), then trading_accounts.
 * - provisioning_logs links accounts back to orders.
 * - `trades` table NOT VERIFIED — query will gracefully return empty.
 *
 * LIVE challenge_accounts columns:
 *   id, trader_id, type, plan, initial_balance, current_balance, peak_balance,
 *   profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, max_calendar_days,
 *   status, started_at, expires_at, passed_at, failed_at, fail_reason, promoted_from, created_at, updated_at
 *
 * LIVE trading_accounts columns:
 *   id, trader_id, challenge_id, account_code, broker_provider, broker_client_id,
 *   broker_credentials_encrypted, balance, available_margin, used_margin, status, locked_reason, created_at, updated_at
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('challenges.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const accountId = params.id;

    // Lookup in challenge_accounts first
    let account: any = null;
    let accountSource = 'challenge_accounts';

    const { data: challengeData } = await supabase
      .from('challenge_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (challengeData) {
      account = challengeData;
      accountSource = 'challenge_accounts';
    } else {
      // Fallback: try trading_accounts
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

    // Provisioning linkage
    let provisioning = null;
    const { data: provLogs } = await supabase
      .from('provisioning_logs')
      .select('*')
      .or(`challenge_account_id.eq.${accountId},trading_account_id.eq.${accountId}`)
      .order('created_at', { ascending: false });

    if (provLogs && provLogs.length > 0) {
      provisioning = {
        status: provLogs[0].status,
        order_id: provLogs[0].order_id,
        error_message: provLogs[0].error_message || null,
        logs: provLogs,
      };
    }

    // Originating order (LIVE columns: plan_type not plan)
    let originatingOrder = null;
    const orderId = provisioning?.order_id;
    if (orderId) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, user_id, plan_type, amount, account_size, status, payment_method, created_at')
        .eq('id', orderId)
        .single();
      originatingOrder = orderData;
    }

    // Resolve user from order
    let user = null;
    if (originatingOrder?.user_id) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, kyc_status')
        .eq('id', originatingOrder.user_id)
        .single();
      user = userData;
    }

    // Linked trading account (if viewing a challenge account)
    let linkedTradingAccount = null;
    if (accountSource === 'challenge_accounts') {
      const { data: taData } = await supabase
        .from('trading_accounts')
        .select('id, account_code, broker_provider, balance, available_margin, used_margin, status')
        .eq('challenge_id', accountId)
        .limit(1);
      if (taData && taData.length > 0) {
        linkedTradingAccount = taData[0];
      }
    }

    return NextResponse.json({
      data: {
        account,
        accountSource,
        user: user ? {
          id: user.id,
          email: user.email,
          name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
          kyc_status: user.kyc_status,
        } : null,
        provisioning,
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
        linkedTradingAccount,
      },
    });
  } catch (err) {
    console.error('Funded detail error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch account' } }, { status: 500 });
  }
}
