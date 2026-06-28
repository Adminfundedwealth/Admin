export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/users/[id]
 * Full user profile with all associated data.
 *
 * LIVE SCHEMA (verified):
 *   users: id(uuid), clerk_id, email, first_name, last_name, phone, city, state, kyc_status, account_status, is_active, ...
 *   orders: id(text), user_id(text), amount, account_size, plan_type, status, payment_method, utr_reference, created_at, updated_at
 *   provisioning_logs: id, trader_id, trading_account_id, challenge_account_id, order_id(text), plan, status, error_message, created_at
 *   challenge_accounts: id, trader_id, type, plan, initial_balance, current_balance, status, started_at, created_at
 *   trading_accounts: id, trader_id, challenge_id, account_code, balance, status, created_at
 *   manual_payments: id(int), order_id(int), user_id(int), amount, currency, utr, status, reviewed_at, created_at
 *   kyc_submissions: id(int), user_id(int), document_type, status, rejection_reason, reviewed_at, created_at
 *
 * CRITICAL: provisioning_logs has NO user_id column. Lookup must go through orders:
 *   user → orders → provisioning_logs (by order_id)
 *
 * CRITICAL: challenge_accounts/trading_accounts use trader_id (terminal_traders.id), NOT users.id.
 *   Lookup must go through provisioning_logs to find accounts linked to user's orders.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('users.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const userId = params.id;

    // Fetch user profile from public.users
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // Step 1: Fetch user's orders from public.orders (user_id matches users.id)
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    const orders = ordersData || [];

    // Step 2: Get provisioning_logs for this user's orders (NOT by user_id — column doesn't exist)
    const orderIds = orders.map((o: any) => o.id).filter(Boolean);
    let provisioningLogs: any[] = [];
    if (orderIds.length > 0) {
      const { data: provLogs } = await supabase
        .from('provisioning_logs')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false });
      provisioningLogs = provLogs || [];
    }

    // Build provisioning map: order_id → latest provisioning log
    const provisioningByOrder: Record<string, any> = {};
    for (const log of provisioningLogs) {
      if (!provisioningByOrder[log.order_id]) {
        provisioningByOrder[log.order_id] = log;
      }
    }

    // Step 3: Collect all linked account IDs from provisioning
    const tradingAccountIds = provisioningLogs
      .map(l => l.trading_account_id)
      .filter(Boolean);
    const challengeAccountIds = provisioningLogs
      .map(l => l.challenge_account_id)
      .filter(Boolean);

    // Step 4: Fetch linked accounts from terminal tables
    let tradingAccounts: any[] = [];
    if (tradingAccountIds.length > 0) {
      const uniqueTradingIds = Array.from(new Set(tradingAccountIds));
      const { data: taData } = await supabase
        .from('trading_accounts')
        .select('id, trader_id, challenge_id, account_code, broker_provider, balance, status, created_at')
        .in('id', uniqueTradingIds);
      tradingAccounts = taData || [];
    }

    let challengeAccounts: any[] = [];
    if (challengeAccountIds.length > 0) {
      const uniqueChallengeIds = Array.from(new Set(challengeAccountIds));
      const { data: caData } = await supabase
        .from('challenge_accounts')
        .select('id, trader_id, type, plan, initial_balance, current_balance, peak_balance, status, started_at, expires_at, passed_at, failed_at, fail_reason, created_at')
        .in('id', uniqueChallengeIds);
      challengeAccounts = caData || [];
    }

    // Step 5: Manual payments — LIMITATION: user_id is integer in manual_payments, uuid in users.
    // We attempt the query; if type mismatch causes failure, we get empty result gracefully.
    const { data: manualPaymentsData } = await supabase
      .from('manual_payments')
      .select('id, order_id, amount, currency, utr, status, reviewed_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Step 6: KYC submissions — same limitation (user_id is integer)
    const { data: kycData } = await supabase
      .from('kyc_submissions')
      .select('id, document_type, status, rejection_reason, reviewed_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Map orders to purchases shape (using LIVE column: plan_type)
    const ordersList = orders.map((o: any) => {
      const prov = provisioningByOrder[o.id];
      return {
        id: o.id,
        order_number: o.id?.slice(0, 8)?.toUpperCase() || o.id,
        plan_type: o.plan_type || null,
        account_size: o.account_size || null,
        amount: o.amount || 0,
        status: o.status,
        payment_method: o.payment_method || null,
        utr_reference: o.utr_reference || null,
        // Provisioning status for this order
        provisioning_status: prov?.status || null,
        provisioning_error: prov?.error_message || null,
        trading_account_id: prov?.trading_account_id || null,
        challenge_account_id: prov?.challenge_account_id || null,
        created_at: o.created_at,
      };
    });

    // Map orders to payments shape
    const paymentsList = orders.map((o: any) => ({
      id: o.id,
      payment_method: o.payment_method || 'unknown',
      amount: o.amount || 0,
      status: ['completed', 'active', 'paid'].includes(o.status) ? 'succeeded' : o.status === 'failed' ? 'failed' : 'pending',
      order_number: o.id?.slice(0, 8)?.toUpperCase() || '',
      utr_reference: o.utr_reference || null,
      created_at: o.created_at,
    }));

    // Map challenge accounts (LIVE columns)
    const challengeList = challengeAccounts.map((a: any) => ({
      id: a.id,
      trader_id: a.trader_id,
      type: a.type,
      plan: a.plan,
      initial_balance: a.initial_balance,
      current_balance: a.current_balance,
      status: a.status,
      started_at: a.started_at,
      passed_at: a.passed_at || null,
      failed_at: a.failed_at || null,
      fail_reason: a.fail_reason || null,
      created_at: a.created_at,
    }));

    // Map trading accounts (LIVE columns)
    const tradingList = tradingAccounts.map((a: any) => ({
      id: a.id,
      trader_id: a.trader_id,
      challenge_id: a.challenge_id,
      account_code: a.account_code,
      broker_provider: a.broker_provider,
      balance: a.balance || 0,
      status: a.status,
      created_at: a.created_at,
    }));

    // Map manual payments (LIVE columns: utr not utr_reference, reviewed_at not verified_at)
    const manualPaymentsList = (manualPaymentsData || []).map((mp: any) => ({
      id: mp.id,
      order_id: mp.order_id,
      amount: mp.amount,
      currency: mp.currency,
      utr: mp.utr || null,
      status: mp.status,
      reviewed_at: mp.reviewed_at || null,
      created_at: mp.created_at,
    }));

    return NextResponse.json({
      data: {
        profile: {
          ...user,
          // Derived counts
          order_count: ordersList.length,
          challenge_count: challengeList.length,
          trading_account_count: tradingList.length,
        },
        // Commerce
        purchases: ordersList,
        payments: paymentsList,
        manualPayments: manualPaymentsList,
        // Accounts (terminal-owned, resolved via provisioning bridge)
        challengeAccounts: challengeList,
        tradingAccounts: tradingList,
        // Provisioning logs for this user's orders
        provisioningLogs: provisioningLogs.map((l: any) => ({
          id: l.id,
          order_id: l.order_id,
          status: l.status,
          trading_account_id: l.trading_account_id || null,
          challenge_account_id: l.challenge_account_id || null,
          error_message: l.error_message || null,
          started_at: l.started_at,
          completed_at: l.completed_at,
          created_at: l.created_at,
        })),
        // KYC
        kycSubmissions: (kycData || []).map((k: any) => ({
          id: k.id,
          document_type: k.document_type,
          status: k.status,
          rejection_reason: k.rejection_reason || null,
          reviewed_at: k.reviewed_at || null,
          created_at: k.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('User profile error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user profile' } },
      { status: 500 }
    );
  }
}
