export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';
import { sanitizeSearchInput } from '@/lib/security/sanitize';

/**
 * GET /api/purchases
 * List commercial orders from the shared `orders` table.
 *
 * LIVE SCHEMA (verified):
 *   orders: id, user_id, amount, account_size, plan_type, status, payment_method, utr_reference, created_at, updated_at
 *   provisioning_logs: id, trader_id, trading_account_id, challenge_account_id, order_id, plan, payment_method, payment_ref, source, status, error_message, started_at, completed_at, created_at
 *
 * NOTE: orders uses `plan_type` (not `plan`). No `currency`, `payment_id`, `discount_code`, `metadata` columns exist.
 */
export async function GET(request: NextRequest) {
  try {
    // Defense-in-depth auth
    const { error: authError } = await requirePermissionInHandler('purchases.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const productType = params.get('product_type');
    const rawSearch = params.get('search');
    const search = rawSearch ? sanitizeSearchInput(rawSearch) : null;
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (productType) query = query.eq('plan_type', productType);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
    if (search && search.length >= 3) {
      query = query.or(
        `id.eq.${search},user_id.eq.${search},utr_reference.ilike.%${search}%`
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

    // Resolve user emails for the returned rows
    const userIds = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, email').in('id', userIds);
      userMap = (users || []).reduce((m: Record<string, string>, u: any) => { m[u.id] = u.email; return m; }, {});
    }

    // Resolve provisioning status via provisioning_logs (order_id → orders.id)
    const orderIds = (data || []).map((r: any) => r.id).filter(Boolean);
    let provisioningMap: Record<string, { status: string; trading_account_id: string | null; challenge_account_id: string | null }> = {};
    if (orderIds.length > 0) {
      const { data: logs } = await supabase
        .from('provisioning_logs')
        .select('order_id, status, trading_account_id, challenge_account_id')
        .in('order_id', orderIds);
      if (logs) {
        for (const log of logs) {
          // Latest log per order wins (logs are not ordered here, but we take last seen)
          provisioningMap[log.order_id] = {
            status: log.status,
            trading_account_id: log.trading_account_id || null,
            challenge_account_id: log.challenge_account_id || null,
          };
        }
      }
    }

    // Map to UI shape — using LIVE column names
    const mapped = (data || []).map((row: any) => {
      const provisioning = provisioningMap[row.id] || null;
      return {
        id: row.id,
        order_number: row.id?.slice(0, 8)?.toUpperCase() || row.id,
        user_id: row.user_id,
        user_email: userMap[row.user_id] || '',
        product_type: row.plan_type || 'challenge',
        plan_type: row.plan_type || null,
        account_size: row.account_size || null,
        amount: row.amount ?? 0,
        currency: 'INR', // Not stored in orders — default based on platform
        final_amount: row.amount ?? 0,
        status: row.status || 'pending',
        payment_method: row.payment_method || null,
        utr_reference: row.utr_reference || null,
        // Provisioning linkage (via provisioning_logs.order_id)
        provisioning_status: provisioning?.status || null,
        challenge_account_id: provisioning?.challenge_account_id || null,
        trading_account_id: provisioning?.trading_account_id || null,
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
      totalOrdersToday: todayData.length,
      totalRevenueToday: todayData
        .filter((o: any) => o.status === 'completed' || o.status === 'paid' || o.status === 'active')
        .reduce((s: number, o: any) => s + (o.amount ?? 0), 0),
      pendingOrders: todayData.filter((o: any) => o.status === 'pending' || o.status === 'awaiting_payment').length,
      failedOrders: todayData.filter((o: any) => o.status === 'failed' || o.status === 'expired').length,
    };

    return NextResponse.json({
      data: mapped,
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      analytics,
    });
  } catch (err) {
    console.error('Purchases list error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch orders' } },
      { status: 500 }
    );
  }
}
