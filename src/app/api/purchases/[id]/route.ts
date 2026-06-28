export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/purchases/[id]
 * Full commercial order detail.
 *
 * LIVE SCHEMA (verified):
 *   orders: id, user_id, amount, account_size, plan_type, status, payment_method, utr_reference, created_at, updated_at
 *   provisioning_logs: id, trader_id, trading_account_id, challenge_account_id, order_id, plan, payment_method, payment_ref, source, status, error_message, started_at, completed_at, created_at
 *   manual_payments: id, order_id(int), user_id(int), payment_method, amount, currency, upi_id, utr, reference, proof_url, proof_file_name, status, rejection_reason, reviewed_by, reviewed_at, metadata, created_at, updated_at
 *   trading_accounts: id, trader_id, challenge_id, account_code, broker_provider, balance, status, created_at, updated_at
 *   challenge_accounts: id, trader_id, type, plan, initial_balance, current_balance, status, started_at, created_at, updated_at
 *
 * NOTE: manual_payments.order_id is integer while orders.id is text.
 *       Direct FK join may not work. We query manual_payments separately and match by reference/amount.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('purchases.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const orderId = params.id;

    // Fetch the order from public.orders
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Fetch user info from public.users
    const { data: user } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', order.user_id)
      .single();

    // Fetch manual_payment supplement.
    // LIMITATION: manual_payments.order_id is integer, orders.id is text.
    // We attempt the query — Supabase may cast or fail gracefully.
    let manualPayment = null;
    const { data: manualPayments } = await supabase
      .from('manual_payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (manualPayments && manualPayments.length > 0) {
      const mp = manualPayments[0];
      // Map live column names to admin-expected names
      manualPayment = {
        id: mp.id,
        order_id: mp.order_id,
        user_id: mp.user_id,
        payment_method: mp.payment_method,
        amount: mp.amount,
        currency: mp.currency,
        utr: mp.utr || null,
        reference: mp.reference || null,
        upi_id: mp.upi_id || null,
        proof_url: mp.proof_url || null,
        status: mp.status,
        rejection_reason: mp.rejection_reason || null,
        reviewed_by: mp.reviewed_by || null,
        reviewed_at: mp.reviewed_at || null,
        created_at: mp.created_at,
      };
    }

    // Fetch provisioning status from provisioning_logs (order_id is text, matches orders.id)
    let provisioning = null;
    const { data: provisioningLogs } = await supabase
      .from('provisioning_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (provisioningLogs && provisioningLogs.length > 0) {
      provisioning = {
        latest: provisioningLogs[0],
        history: provisioningLogs,
        status: provisioningLogs[0].status,
        trading_account_id: provisioningLogs[0].trading_account_id || null,
        challenge_account_id: provisioningLogs[0].challenge_account_id || null,
        error_message: provisioningLogs[0].error_message || null,
      };
    }

    // Fetch linked trading account (terminal-owned)
    let tradingAccount = null;
    const linkedTradingId = provisioning?.trading_account_id;
    if (linkedTradingId) {
      const { data: ta } = await supabase
        .from('trading_accounts')
        .select('*')
        .eq('id', linkedTradingId)
        .single();
      tradingAccount = ta;
    }

    // Fetch linked challenge account (terminal-owned)
    let challengeAccount = null;
    const linkedChallengeId = provisioning?.challenge_account_id;
    if (linkedChallengeId) {
      const { data: ca } = await supabase
        .from('challenge_accounts')
        .select('*')
        .eq('id', linkedChallengeId)
        .single();
      challengeAccount = ca;
    }

    // Map order to detail shape using LIVE column names
    return NextResponse.json({
      data: {
        order: {
          id: order.id,
          order_number: order.id?.slice(0, 8)?.toUpperCase() || order.id,
          user_id: order.user_id,
          user_email: user?.email || '',
          user_name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '',
          plan_type: order.plan_type || null,
          account_size: order.account_size || null,
          amount: order.amount || 0,
          currency: 'INR', // Not in live orders schema — platform default
          status: order.status,
          payment_method: order.payment_method || null,
          utr_reference: order.utr_reference || null,
          created_at: order.created_at,
          updated_at: order.updated_at || order.created_at,
        },
        // Manual payment supplement (bank transfer) — mapped from live columns
        manualPayment,
        // Provisioning linkage
        provisioning: provisioning ? {
          status: provisioning.status,
          trading_account_id: provisioning.trading_account_id,
          challenge_account_id: provisioning.challenge_account_id,
          error_message: provisioning.error_message,
          latest_log: provisioning.latest,
          history: provisioning.history,
        } : null,
        // Linked trading account (terminal-owned, live columns)
        tradingAccount: tradingAccount ? {
          id: tradingAccount.id,
          trader_id: tradingAccount.trader_id,
          challenge_id: tradingAccount.challenge_id,
          account_code: tradingAccount.account_code,
          broker_provider: tradingAccount.broker_provider,
          balance: tradingAccount.balance || 0,
          status: tradingAccount.status,
          created_at: tradingAccount.created_at,
        } : null,
        // Linked challenge account (terminal-owned, live columns)
        challengeAccount: challengeAccount ? {
          id: challengeAccount.id,
          trader_id: challengeAccount.trader_id,
          type: challengeAccount.type,
          plan: challengeAccount.plan,
          initial_balance: challengeAccount.initial_balance || 0,
          current_balance: challengeAccount.current_balance || 0,
          status: challengeAccount.status,
          started_at: challengeAccount.started_at,
          created_at: challengeAccount.created_at,
        } : null,
      },
    });
  } catch (err) {
    console.error('Purchase detail error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch order' } },
      { status: 500 }
    );
  }
}
