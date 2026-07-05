export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/integration/lifecycle
 * 
 * Unified lifecycle events view — aggregates recent state changes from
 * Terminal-owned tables: provisioning_logs, challenge_accounts, risk_alerts.
 * 
 * Used by the Founder dashboard for real-time status overview.
 * Does NOT create duplicate tables — reads shared data only.
 *
 * Returns recent events from last N hours, combined and sorted.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('challenges.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const hoursBack = Math.min(parseInt(params.get('hours') || '24', 10), 168); // max 7 days
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    // Fetch recent provisioning events
    const { data: provisioningEvents } = await supabase
      .from('provisioning_logs')
      .select('id, order_id, status, trading_account_id, challenge_account_id, error_message, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch recent challenge status changes (passed/failed)
    const { data: challengeEvents } = await supabase
      .from('challenge_accounts')
      .select('id, trader_id, type, plan, status, started_at, created_at, updated_at')
      .gte('updated_at', since)
      .in('status', ['passed', 'failed'])
      .order('updated_at', { ascending: false })
      .limit(20);

    // Fetch recent risk events — LIVE TABLE: risk_events (risk_alerts not in schema cache)
    // risk_events cols: id, trading_account_id, challenge_id, event_type, severity, rule_type,
    //                   threshold_value, actual_value, metadata, acknowledged, created_at
    const { data: riskEvents } = await supabase
      .from('risk_events')
      .select('id, trading_account_id, challenge_id, event_type, severity, acknowledged, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    // Unify into timeline format
    const timeline: Array<{
      id: string;
      type: string;
      category: 'provisioning' | 'challenge' | 'risk';
      status: string;
      severity: string;
      description: string;
      entityId: string;
      linkTo: string;
      timestamp: string;
    }> = [];

    for (const p of provisioningEvents || []) {
      timeline.push({
        id: `prov-${p.id}`,
        type: `provisioning.${p.status}`,
        category: 'provisioning',
        status: p.status,
        severity: p.status === 'failed' ? 'high' : p.status === 'completed' ? 'success' : 'info',
        description: p.status === 'failed'
          ? `Provisioning failed: ${p.error_message || 'Unknown'}`
          : `Order ${p.order_id?.slice(0, 8)?.toUpperCase()} → ${p.status}`,
        entityId: p.order_id,
        linkTo: `/purchases/${p.order_id}`,
        timestamp: p.created_at,
      });
    }

    for (const c of challengeEvents || []) {
      timeline.push({
        id: `chal-${c.id}`,
        type: `challenge.${c.status}`,
        category: 'challenge',
        status: c.status,
        severity: c.status === 'passed' ? 'success' : 'warning',
        description: `Challenge ${c.id.slice(0, 8).toUpperCase()} ${c.status} (${c.plan || c.type})`,
        entityId: c.id,
        linkTo: `/challenges/${c.id}`,
        timestamp: c.updated_at || c.created_at,
      });
    }

    for (const r of riskEvents || []) {
      timeline.push({
        id: `risk-${r.id}`,
        type: `risk.${r.event_type}`,
        category: 'risk',
        status: r.acknowledged ? 'acknowledged' : 'open',
        severity: r.severity,
        description: `${r.event_type} (${r.severity}) on trading account ${r.trading_account_id?.slice(0, 8)?.toUpperCase() ?? 'unknown'}`,
        entityId: r.trading_account_id || r.id,
        linkTo: '/risk',
        timestamp: r.created_at,
      });
    }

    // Sort by timestamp descending
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      data: timeline.slice(0, 50),
      meta: {
        hoursBack,
        provisioningCount: (provisioningEvents || []).length,
        challengeCount: (challengeEvents || []).length,
        riskCount: (riskEvents || []).length,
      },
    });
  } catch (err) {
    console.error('Lifecycle events error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch lifecycle events' } },
      { status: 500 }
    );
  }
}
