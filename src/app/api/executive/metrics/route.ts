export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/metrics
 * Returns all KPI data for the Executive Command Center.
 * Includes: revenue today/yesterday/delta, payout liability, pass/fail rates, staff online.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Counts — LIVE TABLE CORRECTIONS:
    // - funded_accounts not in schema cache → use challenge_accounts status=passed
    // - payout_requests not in schema cache → use payout_reviews
    // - risk_alerts not in schema cache → use risk_events
    const [activeUsers, activeChallenges, activeFunded, pendingPayouts, pendingKYC, openTickets, riskAlerts, activeStaff] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).gt('last_activity_at', thirtyDaysAgo).eq('account_status', 'active'),
      supabase.from('challenge_accounts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('challenge_accounts').select('id', { count: 'exact', head: true }).eq('status', 'passed'),
      supabase.from('payout_reviews').select('id, calculated_payout', { count: 'exact' }).in('status', ['request_received', 'under_review']),
      supabase.from('kyc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabase.from('risk_events').select('id', { count: 'exact', head: true }).eq('acknowledged', false),
      supabase.from('staff_sessions').select('id', { count: 'exact', head: true }).is('invalidated_at', null).gt('last_activity', new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ]);

    // Pending payout value
    const pendingPayoutValue = (pendingPayouts.data || []).reduce((sum: number, p: any) => sum + (p.calculated_payout ?? 0), 0);

    // Challenge pass/fail rates
    const { count: totalCompleted } = await supabase.from('challenge_accounts').select('id', { count: 'exact', head: true }).in('status', ['passed', 'failed']);
    const { count: totalPassed } = await supabase.from('challenge_accounts').select('id', { count: 'exact', head: true }).eq('status', 'passed');
    const { count: totalFailed } = await supabase.from('challenge_accounts').select('id', { count: 'exact', head: true }).eq('status', 'failed');

    const passRate = (totalCompleted ?? 0) > 0 ? Math.round(((totalPassed ?? 0) / (totalCompleted ?? 1)) * 100) : 0;
    const failRate = (totalCompleted ?? 0) > 0 ? Math.round(((totalFailed ?? 0) / (totalCompleted ?? 1)) * 100) : 0;

    // Revenue: today vs yesterday — from payout_reviews (live table)
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const startOfYesterday = new Date(new Date().setHours(0, 0, 0, 0) - 86400000).toISOString();

    const { data: todayPayouts } = await supabase.from('payout_reviews').select('calculated_payout').eq('status', 'payment_completed').gte('completed_at', startOfToday);
    const { data: yesterdayPayouts } = await supabase.from('payout_reviews').select('calculated_payout').eq('status', 'payment_completed').gte('completed_at', startOfYesterday).lt('completed_at', startOfToday);

    const revenueToday = (todayPayouts || []).reduce((s: number, p: any) => s + (p.calculated_payout ?? 0), 0);
    const revenueYesterday = (yesterdayPayouts || []).reduce((s: number, p: any) => s + (p.calculated_payout ?? 0), 0);
    const revenueDelta = revenueYesterday > 0 ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100 : 0;

    return NextResponse.json({
      data: {
        activeUsers: activeUsers.count ?? 0,
        activeChallenges: activeChallenges.count ?? 0,
        activeFunded: activeFunded.count ?? 0,
        revenueToday,
        revenueYesterday,
        revenueDelta,
        pendingPayouts: pendingPayouts.count ?? 0,
        pendingPayoutValue,
        pendingKYC: pendingKYC.count ?? 0,
        openTickets: openTickets.count ?? 0,
        riskAlerts: riskAlerts.count ?? 0,
        challengePassRate: passRate,
        challengeFailRate: failRate,
        staffOnline: activeStaff.count ?? 0,
      },
    });
  } catch (err) {
    console.error('Executive metrics error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch metrics' } }, { status: 500 });
  }
}
