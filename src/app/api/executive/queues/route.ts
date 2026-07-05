export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/queues
 * Returns queue counts for pending payouts, KYC, tickets, risk alerts.
 * Reads: payout_requests, kyc_submissions, support_tickets, risk_alerts
 * Auth: Handled by middleware (session_token cookie → staff_sessions validation)
 */

function calcAge(items: any[] | null, now: number): string {
  if (!items || items.length === 0) return '—';
  const oldest = new Date(items[0].created_at).getTime();
  const diffH = Math.floor((now - oldest) / 3600000);
  if (diffH < 1) return '<1h';
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}

function calcAvg(items: any[] | null, now: number): string {
  if (!items || items.length === 0) return '—';
  const totalMs = items.reduce((sum: number, i: any) => sum + (now - new Date(i.created_at).getTime()), 0);
  const avgH = Math.floor(totalMs / items.length / 3600000);
  if (avgH < 1) return '<1h';
  if (avgH < 24) return `${avgH}h`;
  return `${Math.floor(avgH / 24)}d`;
}

function priorityBreakdown(items: any[] | null, field: string): { critical: number; high: number; medium: number; low: number } {
  const result = { critical: 0, high: 0, medium: 0, low: 0 };
  if (!items) return result;
  for (const item of items) {
    const val = item[field]?.toLowerCase();
    if (val === 'critical') result.critical++;
    else if (val === 'high') result.high++;
    else if (val === 'medium') result.medium++;
    else result.low++;
  }
  return result;
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Parallel queries — LIVE TABLE CORRECTIONS:
    // payout_requests → payout_reviews, risk_alerts → risk_events
    const [payoutsRes, kycRes, ticketsRes, riskRes] = await Promise.all([
      supabase
        .from('payout_reviews')
        .select('id, priority, created_at', { count: 'exact' })
        .in('status', ['request_received', 'under_review'])
        .order('created_at', { ascending: true }),
      supabase
        .from('kyc_submissions')
        .select('id, created_at', { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('support_tickets')
        .select('id, priority, created_at', { count: 'exact' })
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: true }),
      // risk_events cols: id, severity, created_at, acknowledged
      supabase
        .from('risk_events')
        .select('id, severity, created_at', { count: 'exact' })
        .eq('acknowledged', false)
        .order('created_at', { ascending: true }),
    ]);

    const now = Date.now();

    return NextResponse.json({
      payouts: {
        count: payoutsRes.count ?? 0,
        oldest: calcAge(payoutsRes.data, now),
        avg: calcAvg(payoutsRes.data, now),
        breakdown: priorityBreakdown(payoutsRes.data, 'priority'),
      },
      kyc: {
        count: kycRes.count ?? 0,
        oldest: calcAge(kycRes.data, now),
        avg: calcAvg(kycRes.data, now),
        breakdown: { critical: 0, high: 0, medium: kycRes.count ?? 0, low: 0 },
      },
      tickets: {
        count: ticketsRes.count ?? 0,
        oldest: calcAge(ticketsRes.data, now),
        avg: calcAvg(ticketsRes.data, now),
        breakdown: priorityBreakdown(ticketsRes.data, 'priority'),
      },
      risk: {
        count: riskRes.count ?? 0,
        oldest: calcAge(riskRes.data, now),
        avg: calcAvg(riskRes.data, now),
        breakdown: priorityBreakdown(riskRes.data, 'severity'),
      },
    });
  } catch (error) {
    console.error('[Executive Queues] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
