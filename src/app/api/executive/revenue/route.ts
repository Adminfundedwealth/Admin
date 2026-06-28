export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/executive/revenue?days=30
 * Returns revenue trend data for charts.
 * Configurable date ranges: 1-365 days.
 */
export async function GET(request: NextRequest) {
  const days = Math.min(
    365,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('days') || '30', 10))
  );

  // TODO: Query from purchases/revenue materialized view
  // Generate placeholder data structure for the chart
  const data: { date: string; revenue: number; challenges: number }[] = [];

  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().slice(0, 10),
      revenue: 0,
      challenges: 0,
    });
  }

  return NextResponse.json({ data });
}
