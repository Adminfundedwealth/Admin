export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/payments/[id]
 * Full payment detail for a specific order.
 *
 * LIVE SCHEMA: orders IS the payment record. No separate payments table.
 * manual_payments uses `utr` (not utr_reference), `reviewed_at` (not verified_at).
 * manual_payments.order_id is integer — may not directly match orders.id (text).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('payments.view');
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
        { error: { code: 'NOT_FOUND', message: 'Payment record not found' } },
        { status: 404 }
      );
    }

    // Fetch user from public.users
    const { data: user } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', order.user_id)
      .single();

    // Fetch manual_payment (LIMITATION: order_id type mismatch possible)
    let manualPayment = null;
    const { data: manuals } = await supabase
      .from('manual_payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (manuals && manuals.length > 0) {
      const mp = manuals[0];
      manualPayment = {
        id: mp.id,
        order_id: mp.order_id,
        payment_method: mp.payment_method,
        amount: mp.amount,
        currency: mp.currency,
        upi_id: mp.upi_id || null,
        utr: mp.utr || null,
        reference: mp.reference || null,
        proof_url: mp.proof_url || null,
        status: mp.status,
        rejection_reason: mp.rejection_reason || null,
        reviewed_by: mp.reviewed_by || null,
        reviewed_at: mp.reviewed_at || null,
        created_at: mp.created_at,
      };
    }

    // Fetch provisioning status
    let provisioning = null;
    const { data: provLogs } = await supabase
      .from('provisioning_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (provLogs && provLogs.length > 0) {
      provisioning = {
        status: provLogs[0].status,
        trading_account_id: provLogs[0].trading_account_id || null,
        challenge_account_id: provLogs[0].challenge_account_id || null,
        error_message: provLogs[0].error_message || null,
      };
    }

    // Fetch linked trading account via provisioning
    let linkedAccount = null;
    if (provisioning?.trading_account_id) {
      const { data: ta } = await supabase
        .from('trading_accounts')
        .select('id, trader_id, challenge_id, account_code, broker_provider, balance, status, created_at')
        .eq('id', provisioning.trading_account_id)
        .single();
      linkedAccount = ta;
    }

    // Map using LIVE column names
    const paymentMethod = order.payment_method || 'unknown';
    const orderStatus = order.status;
    let paymentStatus = 'pending';
    if (['completed', 'active', 'paid'].includes(orderStatus)) paymentStatus = 'succeeded';
    else if (orderStatus === 'failed') paymentStatus = 'failed';
    else if (orderStatus === 'refunded') paymentStatus = 'refunded';

    return NextResponse.json({
      data: {
        payment: {
          id: order.id,
          user_id: order.user_id,
          user_email: user?.email || '',
          user_name: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '',
          purchase_order_id: order.id,
          order_number: order.id?.slice(0, 8)?.toUpperCase() || '',
          provider: paymentMethod,
          amount: order.amount || 0,
          currency: 'INR',
          status: paymentStatus,
          payment_method_type: paymentMethod,
          is_manual: paymentMethod === 'bank_transfer' || paymentMethod === 'manual' || paymentMethod === 'upi' || !!manualPayment,
          utr_reference: order.utr_reference || manualPayment?.utr || null,
          created_at: order.created_at,
          updated_at: order.updated_at || order.created_at,
        },
        manualPayment,
        provisioning,
        linkedAccount,
      },
    });
  } catch (err) {
    console.error('Payment detail error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payment detail' } },
      { status: 500 }
    );
  }
}
