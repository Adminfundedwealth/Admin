export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/founder/trading-accounts/search
 *
 * Search trading + challenge accounts for the Delete/Archive management page.
 *
 * Query params:
 *   q          – free-text: account_code (FW-xxx), trader_id fragment,
 *                challenge account UUID fragment, or email
 *   status     – filter by challenge_accounts.status (default: all)
 *   page_size  – max 100 (default 50)
 *
 * Strategy:
 *   1. If q looks like FW- prefix → search trading_accounts.account_code
 *   2. If q looks like UUID fragment → search challenge_accounts.id
 *   3. If q looks like email → resolve user → trader IDs → challenge accounts
 *   4. Otherwise → search trading_accounts.account_code ILIKE + challenge id ILIKE
 *
 * Returns unified list with both challenge + linked trading account data.
 */
export async function GET(request: NextRequest) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const supabase = createAdminClient();
  const params = request.nextUrl.searchParams;
  const q = params.get('q')?.trim() ?? '';
  const status = params.get('status') ?? '';
  const pageSize = Math.min(parseInt(params.get('page_size') || '50', 10), 100);

  try {
    // ── No search query: return list filtered by status ─────────────────────
    if (!q) {
      let query = supabase
        .from('challenge_accounts')
        .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(pageSize);

      if (status && status !== 'all') query = query.eq('status', status);

      const { data: challenges, count } = await query;

      // Enrich with trading account codes
      const enriched = await enrichWithTradingAccounts(supabase, challenges ?? []);

      return NextResponse.json({
        data: enriched,
        meta: { total: count ?? 0, query: null },
      });
    }

    // ── Search mode ──────────────────────────────────────────────────────────
    const results: EnrichedAccount[] = [];
    const seenIds = new Set<string>();

    // Strategy 1: FW- account_code → trading_accounts.account_code
    if (q.toUpperCase().startsWith('FW-') || /^\d{6,10}$/.test(q)) {
      const { data: tas } = await supabase
        .from('trading_accounts')
        .select('id, account_code, balance, status, challenge_id, trader_id')
        .ilike('account_code', `%${q}%`)
        .limit(20);

      if (tas && tas.length > 0) {
        const challengeIds = tas
          .map((t: Record<string, unknown>) => t.challenge_id as string)
          .filter(Boolean);

        if (challengeIds.length > 0) {
          let caQuery = supabase
            .from('challenge_accounts')
            .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at')
            .in('id', challengeIds);
          if (status && status !== 'all') caQuery = caQuery.eq('status', status);
          const { data: cas } = await caQuery;

          for (const ca of cas ?? []) {
            if (!seenIds.has(ca.id)) {
              seenIds.add(ca.id);
              const ta = tas.find((t: Record<string, unknown>) => t.challenge_id === ca.id);
              results.push({
                ...ca,
                account_code: (ta?.account_code as string) ?? null,
                trading_account_id: (ta?.id as string) ?? null,
              });
            }
          }
        }

        // Also include trading accounts whose challenge_id is null
        for (const ta of tas) {
          if (!ta.challenge_id) {
            const syntheticId = `ta:${ta.id}`;
            if (!seenIds.has(syntheticId)) {
              seenIds.add(syntheticId);
              results.push({
                id: ta.id as string,
                type: null,
                plan: null,
                status: ta.status as string,
                initial_balance: ta.balance as number,
                current_balance: ta.balance as number,
                trader_id: ta.trader_id as string,
                started_at: null,
                created_at: new Date().toISOString(),
                account_code: ta.account_code as string,
                trading_account_id: ta.id as string,
              });
            }
          }
        }
      }
    }

    // Strategy 2: UUID fragment → challenge_accounts.id
    const isUuidLike = /^[0-9a-f-]{6,}/i.test(q);
    if (isUuidLike) {
      let caQuery = supabase
        .from('challenge_accounts')
        .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at')
        .ilike('id', `${q}%`)
        .limit(20);
      if (status && status !== 'all') caQuery = caQuery.eq('status', status);
      const { data: cas } = await caQuery;

      const newCas = (cas ?? []).filter((c: { id: string }) => !seenIds.has(c.id));
      const enriched = await enrichWithTradingAccounts(supabase, newCas);
      for (const e of enriched) {
        seenIds.add(e.id);
        results.push(e);
      }
    }

    // Strategy 3: email → resolve user → trader IDs → challenge accounts
    if (q.includes('@') || q.includes('.')) {
      const { data: users } = await supabase
        .from('users')
        .select('id, email, clerk_id')
        .ilike('email', `%${q}%`)
        .limit(10);

      if (users && users.length > 0) {
        // Get trader IDs linked to these users via provisioning_logs
        const userIds = [
          ...users.map((u: { id: string }) => u.id),
          ...users.map((u: { clerk_id?: string }) => u.clerk_id).filter(Boolean),
        ] as string[];

        const { data: provLogs } = await supabase
          .from('provisioning_logs')
          .select('challenge_account_id, trading_account_id')
          .in('user_id', userIds)
          .not('challenge_account_id', 'is', null);

        const challengeIds = (provLogs ?? [])
          .map((p: { challenge_account_id: string }) => p.challenge_account_id)
          .filter(Boolean) as string[];

        if (challengeIds.length > 0) {
          let caQuery = supabase
            .from('challenge_accounts')
            .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at')
            .in('id', challengeIds)
            .limit(50);
          if (status && status !== 'all') caQuery = caQuery.eq('status', status);
          const { data: cas } = await caQuery;

          const newCas = (cas ?? []).filter((c: { id: string }) => !seenIds.has(c.id));
          const enriched = await enrichWithTradingAccounts(supabase, newCas);
          for (const e of enriched) {
            seenIds.add(e.id);
            results.push(e);
          }
        }
      }
    }

    // Strategy 4: trader_id fragment (short prefix like "aa094c86")
    if (results.length === 0 && q.length >= 4) {
      let caQuery = supabase
        .from('challenge_accounts')
        .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at')
        .ilike('trader_id', `${q}%`)
        .limit(20);
      if (status && status !== 'all') caQuery = caQuery.eq('status', status);
      const { data: cas } = await caQuery;

      const newCas = (cas ?? []).filter((c: { id: string }) => !seenIds.has(c.id));
      const enriched = await enrichWithTradingAccounts(supabase, newCas);
      for (const e of enriched) {
        seenIds.add(e.id);
        results.push(e);
      }
    }

    return NextResponse.json({
      data: results,
      meta: { total: results.length, query: q },
    });
  } catch (err) {
    console.error('Trading accounts search error:', err);
    return NextResponse.json(
      { error: { code: 'SEARCH_ERROR', message: 'Search failed' } },
      { status: 500 },
    );
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface EnrichedAccount {
  id: string;
  type: string | null;
  plan: string | null;
  status: string | null;
  initial_balance: number | null;
  current_balance: number | null;
  trader_id: string | null;
  started_at: string | null;
  created_at: string;
  account_code: string | null;
  trading_account_id: string | null;
}

// ── Helper: attach account_code from trading_accounts ────────────────────────
async function enrichWithTradingAccounts(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  challenges: { id: string; [key: string]: unknown }[],
): Promise<EnrichedAccount[]> {
  if (challenges.length === 0) return [];

  const ids = challenges.map((c) => c.id);
  const { data: tas } = await supabase
    .from('trading_accounts')
    .select('id, account_code, challenge_id, balance')
    .in('challenge_id', ids);

  const taMap: Record<string, { id: string; account_code: string }> = {};
  for (const ta of tas ?? []) {
    if (ta.challenge_id) taMap[ta.challenge_id] = { id: ta.id, account_code: ta.account_code };
  }

  return challenges.map((c) => ({
    id: c.id,
    type: (c.type as string) ?? null,
    plan: (c.plan as string) ?? null,
    status: (c.status as string) ?? null,
    initial_balance: (c.initial_balance as number) ?? null,
    current_balance: (c.current_balance as number) ?? null,
    trader_id: (c.trader_id as string) ?? null,
    started_at: (c.started_at as string) ?? null,
    created_at: c.created_at as string,
    account_code: taMap[c.id]?.account_code ?? null,
    trading_account_id: taMap[c.id]?.id ?? null,
  }));
}
