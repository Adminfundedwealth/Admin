export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/payouts
 * List payout requests with filtering, pagination, and aggregate analytics.
 * SECURITY: Defense-in-depth auth check in handler.
 */
export async function GET(request: NextRequest) {
  try {
    // Defense-in-depth: verify auth even though middleware checks
    const { error: authError } = await requirePermissionInHandler('payouts.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase.from('payout_reviews').select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    // Calculate analytics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const { data: allPayouts } = await supabase
      .from('payout_reviews')
      .select('status, calculated_payout, created_at, completed_at, rejection_reason');

    const completed = (allPayouts || []).filter(p => p.status === 'payment_completed');
    const pending = (allPayouts || []).filter(p => ['request_received', 'under_review', 'approved', 'payment_processing'].includes(p.status));
    const rejected = (allPayouts || []).filter(p => p.rejection_reason);

    const totalPaidMonthly = completed
      .filter(p => p.completed_at && p.completed_at >= startOfMonth)
      .reduce((sum, p) => sum + (p.calculated_payout ?? 0), 0);

    const totalPending = pending.reduce((sum, p) => sum + (p.calculated_payout ?? 0), 0);

    const processingTimes = completed
      .filter(p => p.completed_at && p.created_at)
      .map(p => (new Date(p.completed_at!).getTime() - new Date(p.created_at).getTime()) / 3600000);
    const avgProcessingTimeHours = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length : 0;

    const rejectionRate = (allPayouts || []).length > 0
      ? (rejected.length / (allPayouts || []).length) * 100 : 0;

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      analytics: {
        totalPaidDaily: 0,
        totalPaidWeekly: 0,
        totalPaidMonthly,
        totalPending,
        avgProcessingTimeHours,
        rejectionRate,
      },
    });
  } catch (err) {
    console.error('Payouts list error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payouts' } }, { status: 500 });
  }
}
