import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/feed — Returns recent operations events compiled from existing tables.
 * Unions recent records from: users, payout_requests, kyc_submissions, risk_alerts, support_tickets.
 * Supports pagination via ?page=1&limit=25
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10)));

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h

    // Fetch recent events from existing tables in parallel
    const [usersRes, payoutsRes, kycRes, riskRes, ticketsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('payout_requests')
        .select('id, status, created_at, updated_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('kyc_submissions')
        .select('id, status, created_at, updated_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('risk_alerts')
        .select('id, severity, alert_type, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('support_tickets')
        .select('id, subject, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Map to unified feed event format
    const events: any[] = [];

    for (const row of usersRes.data ?? []) {
      events.push({
        id: `reg-${row.id}`,
        type: 'registration',
        description: `New user registered: ${row.email}`,
        actor: row.email,
        timestamp: row.created_at,
        severity: 'info',
        entityId: row.id,
        entityType: 'user',
      });
    }

    for (const row of payoutsRes.data ?? []) {
      events.push({
        id: `payout-${row.id}`,
        type: 'payout_request',
        description: `Payout request ${row.status}`,
        actor: 'Trader',
        timestamp: row.created_at,
        severity: row.status === 'pending' ? 'warning' : 'info',
        entityId: row.id,
        entityType: 'payout',
      });
    }

    for (const row of kycRes.data ?? []) {
      const type = row.status === 'approved' ? 'kyc_approval' : row.status === 'rejected' ? 'kyc_rejection' : 'kyc_submission';
      events.push({
        id: `kyc-${row.id}`,
        type,
        description: `KYC ${row.status}`,
        actor: 'Trader',
        timestamp: row.updated_at ?? row.created_at,
        severity: row.status === 'rejected' ? 'warning' : 'info',
        entityId: row.id,
        entityType: 'kyc',
      });
    }

    for (const row of riskRes.data ?? []) {
      events.push({
        id: `risk-${row.id}`,
        type: 'risk_alert',
        description: `Risk alert: ${row.alert_type} (${row.severity})`,
        actor: 'System',
        timestamp: row.created_at,
        severity: row.severity === 'critical' || row.severity === 'high' ? 'critical' : 'warning',
        entityId: row.id,
        entityType: 'risk_alert',
      });
    }

    for (const row of ticketsRes.data ?? []) {
      events.push({
        id: `ticket-${row.id}`,
        type: 'ticket_created',
        description: `Ticket: ${row.subject?.substring(0, 60) ?? 'New ticket'}`,
        actor: 'Trader',
        timestamp: row.created_at,
        severity: 'info',
        entityId: row.id,
        entityType: 'ticket',
      });
    }

    // Sort by timestamp descending and limit
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limited = events.slice(0, limit);

    return NextResponse.json({ events: limited, page: 1, limit });
  } catch (error) {
    console.error('[Feed API] Error:', error);
    return NextResponse.json({ events: [], error: 'Failed to load feed' }, { status: 500 });
  }
}
