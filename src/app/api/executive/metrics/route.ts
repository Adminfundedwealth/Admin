import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/metrics
 * Returns aggregated KPI data for the Executive Command Center.
 * "Active" = at least one login or account activity within last 30 days.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    // Active users (activity in last 30 days)
    const { count: activeUsers } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gt('last_activity_at', thirtyDaysAgo)
      .eq('account_status', 'active');

    // Active challenges
    const { count: activeChallenges } = await supabase
      .from('challenge_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // Active funded accounts
    const { count: activeFunded } = await supabase
      .from('funded_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // Pending payouts
    const { count: pendingPayouts } = await supabase
      .from('payout_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['request_received', 'under_review']);

    // Pending KYC
    const { count: pendingKYC } = await supabase
      .from('kyc_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Open support tickets
    const { count: openTickets } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);

    // Active risk alerts
    const { count: riskAlerts } = await supabase
      .from('risk_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');

    return NextResponse.json({
      data: {
        activeUsers: activeUsers || 0,
        activeChallenges: activeChallenges || 0,
        activeFunded: activeFunded || 0,
        revenueMTD: 0, // TODO: Calculate from purchases table
        revenueDaily: 0,
        pendingPayouts: pendingPayouts || 0,
        pendingKYC: pendingKYC || 0,
        openTickets: openTickets || 0,
        riskAlerts: riskAlerts || 0,
      },
    });
  } catch (err) {
    console.error('Executive metrics error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch metrics' } },
      { status: 500 }
    );
  }
}
