export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/revenue?days=30
 * Returns revenue trend data for charts.
 * Configurable date ranges: 1-365 days.
 * 
 * Revenue is calculated from completed orders (paid purchases).
 * Challenges represent new challenge_accounts created each day.
 */
export async function GET(request: NextRequest) {
  try {
    const days = Math.min(
      365,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('days') || '30', 10))
    );

    const supabase = createAdminClient();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString().slice(0, 10);

    // Fetch orders grouped by date (revenue)
    const { data: ordersData } = await supabase
      .from('orders')
      .select('amount, created_at')
      .in('status', ['completed', 'paid', 'active'])
      .gte('created_at', startISO + 'T00:00:00.000Z')
      .order('created_at', { ascending: true });

    // Fetch challenge accounts grouped by date
    const { data: challengesData } = await supabase
      .from('challenge_accounts')
      .select('created_at')
      .gte('created_at', startISO + 'T00:00:00.000Z')
      .order('created_at', { ascending: true });

    // Build daily aggregates
    const revenueByDate: Record<string, number> = {};
    const challengesByDate: Record<string, number> = {};

    for (const order of ordersData || []) {
      const date = order.created_at.slice(0, 10);
      revenueByDate[date] = (revenueByDate[date] ?? 0) + (order.amount ?? 0);
    }

    for (const challenge of challengesData || []) {
      const date = challenge.created_at.slice(0, 10);
      challengesByDate[date] = (challengesByDate[date] || 0) + 1;
    }

    // Generate time series data
    const data: { date: string; revenue: number; challenges: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      data.push({
        date: dateStr,
        revenue: revenueByDate[dateStr] ?? 0,
        challenges: challengesByDate[dateStr] ?? 0,
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Revenue trend error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch revenue data' } },
      { status: 500 }
    );
  }
}
