export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/drill-down?type=active_users|active_challenges|funded_accounts|staff_online
 *
 * LIVE SCHEMA (verified):
 *   users: id, email, first_name, last_name, city, state, kyc_status, account_status,
 *          is_active, created_at, updated_at
 *          NOTE: NO username, country, last_activity_at, last_login_at columns
 *
 *   challenge_accounts: id, trader_id, type, plan, initial_balance, current_balance,
 *          peak_balance, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct,
 *          min_trading_days, max_calendar_days, status, started_at, expires_at,
 *          passed_at, failed_at, fail_reason, promoted_from, created_at, updated_at
 *          NOTE: NO user_id, account_number, phase, profit_pct, trading_days_completed
 *          NOTE: trader_id references terminal traders (NOT public.users.id)
 *
 *   provisioning_logs: id, trader_id, challenge_account_id, order_id, status, created_at
 *   orders: id, user_id, amount, account_size, plan_type, status, created_at
 *          — user_id references public.users.id
 *
 *   staff_members: id, name, email, status, totp_enabled, created_at
 *   staff_sessions: id, staff_id, last_activity, invalidated_at, ip_address, browser, os, created_at
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
      // ─── Active Users ────────────────────────────────────────────────────────
      case 'active_users': {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, city, state, kyc_status, account_status, is_active, created_at')
          .eq('account_status', 'active')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const rows = (data || []).map((u) => ({
          id: u.id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
          location: [u.city, u.state].filter(Boolean).join(', ') || '—',
          kycStatus: u.kyc_status,
          accountStatus: u.account_status,
          isActive: u.is_active,
          joinedAt: u.created_at,
        }));

        return NextResponse.json({ type, count: rows.length, rows });
      }

      // ─── Active Challenges ───────────────────────────────────────────────────
      case 'active_challenges': {
        const { data, error } = await supabase
          .from('challenge_accounts')
          .select('id, trader_id, type, plan, initial_balance, current_balance, peak_balance, min_trading_days, started_at, expires_at, created_at')
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const challengeIds = (data || []).map((c) => c.id);
        const traderIds = Array.from(new Set((data || []).map((c) => c.trader_id).filter(Boolean)));

        // Try to resolve trader_id → user email via provisioning_logs → orders → users
        let traderEmailMap: Record<string, string> = {};
        if (traderIds.length > 0) {
          const { data: provLogs } = await supabase
            .from('provisioning_logs')
            .select('trader_id, order_id')
            .in('trader_id', traderIds)
            .not('order_id', 'is', null);

          if (provLogs && provLogs.length > 0) {
            const orderIds = Array.from(new Set(provLogs.map((p: any) => p.order_id).filter(Boolean)));
            const traderToOrder: Record<string, string> = {};
            for (const p of provLogs) {
              if (p.trader_id && p.order_id && !traderToOrder[p.trader_id]) {
                traderToOrder[p.trader_id] = p.order_id;
              }
            }

            if (orderIds.length > 0) {
              const { data: orders } = await supabase
                .from('orders')
                .select('id, user_id')
                .in('id', orderIds);

              const orderToUser: Record<string, string> = {};
              for (const o of (orders || [])) {
                if (o.id && o.user_id) orderToUser[o.id] = o.user_id;
              }

              const userIds = Array.from(new Set(Object.values(orderToUser)));
              if (userIds.length > 0) {
                const { data: users } = await supabase
                  .from('users')
                  .select('id, email')
                  .in('id', userIds);

                const userEmailMap: Record<string, string> = {};
                for (const u of (users || [])) userEmailMap[u.id] = u.email;

                for (const traderId of traderIds) {
                  const orderId = traderToOrder[traderId];
                  const userId = orderId ? orderToUser[orderId] : undefined;
                  const email = userId ? userEmailMap[userId] : undefined;
                  if (email) traderEmailMap[traderId] = email;
                }
              }
            }
          }
        }

        const rows = (data || []).map((c) => {
          const profitPct = c.initial_balance && c.initial_balance > 0
            ? ((c.current_balance - c.initial_balance) / c.initial_balance) * 100
            : 0;
          return {
            id: c.id,
            traderId: c.trader_id,
            email: traderEmailMap[c.trader_id] || '—',
            type: c.type || '—',
            plan: c.plan || '—',
            initialBalance: c.initial_balance,
            currentBalance: c.current_balance,
            profitPct: parseFloat(profitPct.toFixed(2)),
            minTradingDays: c.min_trading_days,
            startedAt: c.started_at,
            expiresAt: c.expires_at,
          };
        });

        return NextResponse.json({ type, count: rows.length, rows });
      }

      // ─── Funded Accounts ─────────────────────────────────────────────────────
      case 'funded_accounts': {
        // funded_accounts table does not exist — use challenge_accounts status=passed
        const { data, error } = await supabase
          .from('challenge_accounts')
          .select('id, trader_id, type, plan, initial_balance, current_balance, peak_balance, passed_at, created_at')
          .eq('status', 'passed')
          .order('passed_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const traderIds = Array.from(new Set((data || []).map((c) => c.trader_id).filter(Boolean)));

        // Resolve emails via provisioning_logs → orders → users
        let traderEmailMap: Record<string, string> = {};
        if (traderIds.length > 0) {
          const { data: provLogs } = await supabase
            .from('provisioning_logs')
            .select('trader_id, order_id')
            .in('trader_id', traderIds)
            .not('order_id', 'is', null);

          if (provLogs && provLogs.length > 0) {
            const traderToOrder: Record<string, string> = {};
            for (const p of provLogs) {
              if (p.trader_id && p.order_id && !traderToOrder[p.trader_id]) {
                traderToOrder[p.trader_id] = p.order_id;
              }
            }
            const orderIds = Array.from(new Set(Object.values(traderToOrder)));

            if (orderIds.length > 0) {
              const { data: orders } = await supabase
                .from('orders')
                .select('id, user_id')
                .in('id', orderIds);

              const orderToUser: Record<string, string> = {};
              for (const o of (orders || [])) {
                if (o.id && o.user_id) orderToUser[o.id] = o.user_id;
              }

              const userIds = Array.from(new Set(Object.values(orderToUser)));
              if (userIds.length > 0) {
                const { data: users } = await supabase
                  .from('users')
                  .select('id, email')
                  .in('id', userIds);

                const userEmailMap: Record<string, string> = {};
                for (const u of (users || [])) userEmailMap[u.id] = u.email;

                for (const traderId of traderIds) {
                  const orderId = traderToOrder[traderId];
                  const userId = orderId ? orderToUser[orderId] : undefined;
                  const email = userId ? userEmailMap[userId] : undefined;
                  if (email) traderEmailMap[traderId] = email;
                }
              }
            }
          }
        }

        const rows = (data || []).map((c) => {
          const profitLoss = (c.current_balance ?? 0) - (c.initial_balance ?? 0);
          return {
            id: c.id,
            traderId: c.trader_id,
            email: traderEmailMap[c.trader_id] || '—',
            type: c.type || '—',
            plan: c.plan || '—',
            initialBalance: c.initial_balance,
            currentBalance: c.current_balance,
            peakBalance: c.peak_balance,
            profitLoss: parseFloat(profitLoss.toFixed(2)),
            fundedAt: c.passed_at || c.created_at,
          };
        });

        return NextResponse.json({ type, count: rows.length, rows });
      }

      // ─── Staff Online ─────────────────────────────────────────────────────────
      case 'staff_online': {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: sessions, error } = await supabase
          .from('staff_sessions')
          .select('id, staff_id, last_activity, created_at, ip_address, browser, os')
          .is('invalidated_at', null)
          .gt('last_activity', thirtyMinutesAgo)
          .order('last_activity', { ascending: false });

        if (error) throw error;

        const staffIds = Array.from(new Set((sessions || []).map((s) => s.staff_id).filter(Boolean)));
        let staffMap: Record<string, { email: string; name: string; status: string }> = {};

        if (staffIds.length > 0) {
          const { data: staffMembers } = await supabase
            .from('staff_members')
            .select('id, email, name, status')
            .in('id', staffIds);

          for (const s of (staffMembers || [])) {
            staffMap[s.id] = { email: s.email, name: s.name, status: s.status };
          }
        }

        const rows = (sessions || []).map((s) => ({
          sessionId: s.id,
          staffId: s.staff_id,
          email: staffMap[s.staff_id]?.email || '—',
          name: staffMap[s.staff_id]?.name || '—',
          staffStatus: staffMap[s.staff_id]?.status || '—',
          lastActivity: s.last_activity,
          sessionStarted: s.created_at,
          ipAddress: s.ip_address || '—',
          browser: s.browser || '—',
          os: s.os || '—',
        }));

        return NextResponse.json({ type, count: rows.length, rows });
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`Drill-down error [${type}]:`, err?.message || err);
    return NextResponse.json({ error: 'Failed to fetch drill-down data', detail: err?.message, rows: [] }, { status: 500 });
  }
}
