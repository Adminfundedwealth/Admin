export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/drill-down?type=active_users|active_challenges|funded_accounts|staff_online
 * Returns detailed list data for Command Center KPI drill-downs.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (!type) {
    return NextResponse.json({ error: 'type parameter required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (type) {
      case 'active_users': {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, username, country, last_activity_at, last_login_at, kyc_status, created_at')
          .eq('account_status', 'active')
          .gt('last_activity_at', thirtyDaysAgo)
          .order('last_activity_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const rows = (data || []).map((u) => ({
          id: u.id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '—',
          country: u.country || '—',
          lastActive: u.last_activity_at,
          lastLogin: u.last_login_at,
          kycStatus: u.kyc_status,
          joinedAt: u.created_at,
        }));

        return NextResponse.json({ type, count: rows.length, rows });
      }

      case 'active_challenges': {
        const { data, error } = await supabase
          .from('challenge_accounts')
          .select('id, user_id, account_number, challenge_type, phase, initial_balance, current_balance, profit_pct, trading_days_completed, min_trading_days, started_at, expires_at')
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        // Fetch user emails for the challenge accounts
        const userIds = [...new Set((data || []).map((c) => c.user_id))];
        let emailMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .in('id', userIds);
          emailMap = Object.fromEntries(
            (users || []).map((u) => [u.id, u.email])
          );
        }

        const rows = (data || []).map((c) => ({
          id: c.id,
          accountNumber: c.account_number,
          email: emailMap[c.user_id] || '—',
          userId: c.user_id,
          challengeType: c.challenge_type,
          phase: c.phase,
          initialBalance: c.initial_balance,
          currentBalance: c.current_balance,
          profitPct: c.profit_pct,
          tradingDays: c.trading_days_completed,
          minTradingDays: c.min_trading_days,
          startedAt: c.started_at,
          expiresAt: c.expires_at,
        }));

        return NextResponse.json({ type, count: rows.length, rows });
      }

      case 'funded_accounts': {
        // funded_accounts may not exist; fall back to challenge_accounts with status=passed
        let rows: any[] = [];
        let useFallback = false;

        const { data: faData, error: faError } = await supabase
          .from('funded_accounts')
          .select('id, user_id, account_number, account_size, current_equity, profit_loss, status, funded_at, payout_eligible')
          .eq('status', 'active')
          .order('funded_at', { ascending: false })
          .limit(100);

        if (faError || !faData) {
          useFallback = true;
        } else {
          rows = faData;
        }

        if (useFallback) {
          const { data: caData } = await supabase
            .from('challenge_accounts')
            .select('id, user_id, account_number, challenge_type, initial_balance, current_balance, profit_pct, completed_at')
            .eq('status', 'passed')
            .order('completed_at', { ascending: false })
            .limit(100);

          rows = (caData || []).map((c) => ({
            id: c.id,
            userId: c.user_id,
            accountNumber: c.account_number,
            accountSize: c.initial_balance,
            currentEquity: c.current_balance,
            profitLoss: c.current_balance - c.initial_balance,
            status: 'passed',
            fundedAt: c.completed_at,
            payoutEligible: null,
            source: 'challenge_passed',
          }));
        } else {
          rows = rows.map((f: any) => ({
            id: f.id,
            userId: f.user_id,
            accountNumber: f.account_number,
            accountSize: f.account_size,
            currentEquity: f.current_equity,
            profitLoss: f.profit_loss,
            status: f.status,
            fundedAt: f.funded_at,
            payoutEligible: f.payout_eligible,
            source: 'funded_accounts',
          }));
        }

        // Attach user emails
        const userIds = [...new Set(rows.map((r) => r.userId || r.user_id))];
        let emailMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .in('id', userIds);
          emailMap = Object.fromEntries(
            (users || []).map((u) => [u.id, u.email])
          );
        }

        const finalRows = rows.map((r) => ({
          ...r,
          email: emailMap[r.userId || r.user_id] || '—',
        }));

        return NextResponse.json({ type, count: finalRows.length, rows: finalRows });
      }

      case 'staff_online': {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: sessions, error } = await supabase
          .from('staff_sessions')
          .select('id, staff_id, last_activity, created_at, ip_address, browser, os')
          .is('invalidated_at', null)
          .gt('last_activity', thirtyMinutesAgo)
          .order('last_activity', { ascending: false });

        if (error) throw error;

        // Get staff member details
        const staffIds = [...new Set((sessions || []).map((s) => s.staff_id))];
        let staffMap: Record<string, { email: string; name: string; status: string }> = {};
        if (staffIds.length > 0) {
          const { data: staffMembers } = await supabase
            .from('staff_members')
            .select('id, email, name, status')
            .in('id', staffIds);
          staffMap = Object.fromEntries(
            (staffMembers || []).map((s) => [s.id, { email: s.email, name: s.name, status: s.status }])
          );
        }

        const rows = (sessions || []).map((s) => ({
          sessionId: s.id,
          staffId: s.staff_id,
          email: staffMap[s.staff_id]?.email || '—',
          name: staffMap[s.staff_id]?.name || '—',
          staffStatus: staffMap[s.staff_id]?.status || '—',
          lastActivity: s.last_activity,
          sessionStarted: s.created_at,
          ipAddress: s.ip_address,
          browser: s.browser || '—',
          os: s.os || '—',
        }));

        return NextResponse.json({ type, count: rows.length, rows });
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }
  } catch (err) {
    console.error('Drill-down error:', err);
    return NextResponse.json({ error: 'Failed to fetch drill-down data', rows: [] }, { status: 500 });
  }
}
