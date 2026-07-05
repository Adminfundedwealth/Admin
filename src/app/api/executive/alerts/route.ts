export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Alert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  message: string;
  timestamp: string;
  actionable: boolean;
  actionUrl?: string;
}

/**
 * GET /api/executive/alerts
 * Returns operational alerts based on real-time system state.
 * 
 * Monitors:
 * - Open risk alerts (critical severity)
 * - Overdue KYC submissions (>7 days pending)
 * - Failed provisioning (stuck in processing >1hr)
 * - SLA-breached support tickets
 * - Large pending payouts (>₹100k)
 * - Account lockouts in last hour
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const alerts: Alert[] = [];
    const now = Date.now();

    // 1. Critical risk events — LIVE TABLE: risk_events (risk_alerts not in schema cache)
    // risk_events cols: id, trading_account_id, challenge_id, event_type, severity, acknowledged, created_at
    const { data: riskAlerts, count: riskCount } = await supabase
      .from('risk_events')
      .select('id, severity, event_type, created_at', { count: 'exact' })
      .eq('acknowledged', false)
      .eq('severity', 'critical')
      .limit(5);

    if (riskCount && riskCount > 0) {
      alerts.push({
        id: 'risk-critical',
        severity: 'critical',
        category: 'Risk',
        title: `${riskCount} Critical Risk Alert${riskCount > 1 ? 's' : ''}`,
        message: `${riskCount} critical risk alert${riskCount > 1 ? 's' : ''} require${riskCount === 1 ? 's' : ''} immediate attention`,
        timestamp: riskAlerts?.[0]?.created_at || new Date().toISOString(),
        actionable: true,
        actionUrl: '/risk',
      });
    }

    // 2. Overdue KYC submissions (>7 days pending)
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: overdueKYC } = await supabase
      .from('kyc_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', sevenDaysAgo);

    if (overdueKYC && overdueKYC > 0) {
      alerts.push({
        id: 'kyc-overdue',
        severity: 'high',
        category: 'KYC',
        title: `${overdueKYC} Overdue KYC Submission${overdueKYC > 1 ? 's' : ''}`,
        message: `${overdueKYC} KYC submission${overdueKYC > 1 ? 's have' : ' has'} been pending for over 7 days`,
        timestamp: new Date().toISOString(),
        actionable: true,
        actionUrl: '/kyc',
      });
    }

    // 3. Failed provisioning (stuck in processing >1hr)
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const { data: stuckProvision, count: stuckCount } = await supabase
      .from('provisioning_logs')
      .select('id, created_at', { count: 'exact' })
      .eq('status', 'processing')
      .lt('created_at', oneHourAgo)
      .limit(1);

    if (stuckCount && stuckCount > 0) {
      alerts.push({
        id: 'provision-stuck',
        severity: 'high',
        category: 'Provisioning',
        title: `${stuckCount} Stuck Provisioning Job${stuckCount > 1 ? 's' : ''}`,
        message: `${stuckCount} provisioning job${stuckCount > 1 ? 's have' : ' has'} been processing for over 1 hour`,
        timestamp: stuckProvision?.[0]?.created_at || new Date().toISOString(),
        actionable: true,
        actionUrl: '/provision',
      });
    }

    // 4. SLA-breached support tickets
    const { count: slaBreach } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('sla_breached', true)
      .in('status', ['open', 'in_progress']);

    if (slaBreach && slaBreach > 0) {
      alerts.push({
        id: 'support-sla',
        severity: 'medium',
        category: 'Support',
        title: `${slaBreach} SLA-Breached Ticket${slaBreach > 1 ? 's' : ''}`,
        message: `${slaBreach} support ticket${slaBreach > 1 ? 's have' : ' has'} exceeded SLA deadline`,
        timestamp: new Date().toISOString(),
        actionable: true,
        actionUrl: '/support',
      });
    }

    // 5. Large pending payouts — LIVE TABLE: payout_reviews
    const { data: largePayouts, count: largePayoutCount } = await supabase
      .from('payout_reviews')
      .select('id, calculated_payout, created_at', { count: 'exact' })
      .in('status', ['request_received', 'under_review'])
      .gt('calculated_payout', 100000)
      .order('calculated_payout', { ascending: false })
      .limit(1);

    if (largePayoutCount && largePayoutCount > 0) {
      const totalAmount = largePayouts?.reduce((sum, p) => sum + (p.calculated_payout || 0), 0) || 0;
      alerts.push({
        id: 'payout-large',
        severity: 'medium',
        category: 'Payouts',
        title: `${largePayoutCount} Large Payout${largePayoutCount > 1 ? 's' : ''} Pending`,
        message: `₹${totalAmount.toLocaleString()} in large payouts (>₹100k each) awaiting review`,
        timestamp: largePayouts?.[0]?.created_at || new Date().toISOString(),
        actionable: true,
        actionUrl: '/payouts',
      });
    }

    // 6. Account lockouts in last hour
    const { count: lockouts } = await supabase
      .from('staff_members')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'locked')
      .gte('locked_until', oneHourAgo);

    if (lockouts && lockouts > 0) {
      alerts.push({
        id: 'staff-lockout',
        severity: 'low',
        category: 'Security',
        title: `${lockouts} Staff Account${lockouts > 1 ? 's' : ''} Locked`,
        message: `${lockouts} staff account${lockouts > 1 ? 's were' : ' was'} locked in the last hour due to failed login attempts`,
        timestamp: new Date().toISOString(),
        actionable: true,
        actionUrl: '/staff',
      });
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return NextResponse.json({ data: alerts });
  } catch (err) {
    console.error('Alerts error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch alerts' } }, { status: 500 });
  }
}
