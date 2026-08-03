export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';
import { sanitizeSearchInput } from '@/lib/security/sanitize';

/**
 * GET /api/payments
 * Operational payment view for admin.
 *
 * LIVE SCHEMA (verified):
 *   orders: id(text), user_id, amount, account_size, plan_type, status, payment_method, utr_reference, created_at, updated_at
 *   manual_payments: id(int), order_id(int), user_id(int), payment_method, amount, currency, upi_id, utr, reference, proof_url, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
 *
 * IMPORTANT: There is NO separate payments table. Orders ARE the payment ledger.
 * manual_payments.order_id is integer vs orders.id is text — join may not work directly.
 * We query manual_payments independently and match where possible.
 */
export async function GET(request: NextRequest) {
  try {
    // Defense-in-depth auth
    const { error: authError } = await requirePermissionInHandler('payments.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const provider = params.get('provider');
    const rawSearch = params.get('search');
    const search = rawSearch ? sanitizeSearchInput(rawSearch) : null;
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    // Query public.orders as the primary payment record
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' });

    // Map UI status filters to order status values
    if (status) {
      if (status === 'succeeded') {
        query = query.in('status', ['completed', 'active', 'paid']);
      } else if (status === 'failed') {
        query = query.eq('status', 'failed');
      } else if (status === 'pending' || status === 'processing') {
        query = query.in('status', ['pending', 'awaiting_payment', 'processing']);
      } else if (status === 'refunded') {
        query = query.eq('status', 'refunded');
      } else {
        query = query.eq('status', status);
      }
    }

    // Filter by payment method (live column: payment_method)
    if (provider) {
      query = query.eq('payment_method', provider);
    }

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
    if (search && search.length >= 3) {
      // Live searchable columns: id, user_id, utr_reference
      query = query.or(
        `utr_reference.ilike.%${search}%,id.eq.${search},user_id.eq.${search}`
      );
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Resolve user emails from public.users
    const userIds = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, email').in('id', userIds);
      userMap = (users || []).reduce((m: Record<string, string>, u: any) => { m[u.id] = u.email; return m; }, {});
    }

    // Attempt to fetch manual_payments linked to these orders.
    // LIMITATION: manual_payments.order_id is integer, orders.id is text.
    // This query may return empty if Supabase cannot cast. That's acceptable.
    const orderIds = (data || []).map((r: any) => r.id).filter(Boolean);
    let manualMap: Record<string, any> = {};
    if (orderIds.length > 0) {
      const { data: manuals } = await supabase
        .from('manual_payments')
        .select('order_id, status, reviewed_at, utr, amount')
        .in('order_id', orderIds);
      if (manuals) {
        manualMap = manuals.reduce((m: Record<string, any>, mp: any) => {
          m[String(mp.order_id)] = mp;
          return m;
        }, {});
      }
    }

    // Map orders to payment-view UI shape using LIVE columns
    const mapped = (data || []).map((row: any) => {
      const paymentMethod = row.payment_method || 'unknown';
      const manual = manualMap[row.id] || manualMap[String(row.id)] || null;
      const isManual = paymentMethod === 'bank_transfer' || paymentMethod === 'manual' || paymentMethod === 'upi' || !!manual;
      const orderStatus = row.status;

      // Map order status to payment-style status
      let paymentStatus = 'pending';
      if (['completed', 'active', 'paid'].includes(orderStatus)) paymentStatus = 'succeeded';
      else if (orderStatus === 'failed') paymentStatus = 'failed';
      else if (orderStatus === 'refunded') paymentStatus = 'refunded';
      else if (['pending', 'awaiting_payment', 'processing'].includes(orderStatus)) paymentStatus = 'pending';

      return {
        id: row.id,
        user_id: row.user_id,
        user_email: userMap[row.user_id] || '',
        purchase_order_id: row.id,
        order_number: row.id?.slice(0, 8)?.toUpperCase() || '',
        provider: paymentMethod,
        provider_transaction_id: row.utr_reference || null,
        amount: row.amount ?? 0,
        currency: 'INR', // Not in live orders schema — platform default
        fee: 0,
        net_amount: row.amount ?? 0,
        status: paymentStatus,
        payment_method_type: paymentMethod,
        is_manual: isManual,
        // Manual payment supplement (live column names)
        manual_payment_status: manual?.status || null,
        manual_payment_reviewed_at: manual?.reviewed_at || null,
        manual_payment_utr: manual?.utr || null,
        created_at: row.created_at,
      };
    });

    // Analytics
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('id, amount, status')
      .gte('created_at', startOfToday);

    const todayData = todayOrders || [];
    const analytics = {
      totalCollectedToday: todayData
        .filter((o: any) => ['completed', 'active', 'paid'].includes(o.status))
        .reduce((s: number, o: any) => s + (o.amount ?? 0), 0),
      totalFeesToday: 0,
      failedCount: todayData.filter((o: any) => o.status === 'failed').length,
      disputedCount: 0,
    };

    return NextResponse.json({
      data: mapped,
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      analytics,
    });
  } catch (err) {
    console.error('Payments list error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payments' } },
      { status: 500 }
    );
  }
}
