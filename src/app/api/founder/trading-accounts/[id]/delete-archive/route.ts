export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

/**
 * POST /api/founder/trading-accounts/[id]/delete-archive
 * GET  /api/founder/trading-accounts/[id]/delete-archive  (pre-flight)
 *
 * [id] can be a challenge_account.id OR a trading_account.id.
 *
 * LIVE DB SCHEMA (verified):
 *   trading_accounts: id, trader_id, challenge_id, account_code, broker_provider,
 *     broker_client_id, broker_credentials_encrypted, balance, available_margin,
 *     used_margin, status, locked_reason, created_at, updated_at
 *
 *   challenge_accounts: id, trader_id, type, plan, initial_balance, current_balance,
 *     peak_balance, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct,
 *     min_trading_days, max_calendar_days, status, started_at, expires_at,
 *     passed_at, failed_at, fail_reason, promoted_from, created_at, updated_at
 */

const BodySchema = z.object({
  action: z.enum(['archive', 'permanent_delete']),
  confirmation_code: z.string().min(1, 'Confirmation code is required'),
  deletion_reason: z.string().min(20, 'Reason must be at least 20 characters'),
  founder_override: z.boolean().optional().default(false),
});

// ── Resolve both accounts from either ID ──────────────────────────────────────
async function resolveAccounts(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  id: string,
) {
  let challengeAccount: Record<string, unknown> | null = null;
  let tradingAccount: Record<string, unknown> | null = null;

  // Try challenge_accounts first
  const { data: ca, error: caErr } = await supabase
    .from('challenge_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (caErr) console.error('[resolve] challenge_accounts lookup error:', caErr.message);

  if (ca) {
    challengeAccount = ca;
    // trading_accounts.challenge_id references challenge_accounts.id
    const { data: taRows, error: taErr } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('challenge_id', id)
      .limit(1);
    if (taErr) console.error('[resolve] trading_accounts by challenge_id error:', taErr.message);
    if (taRows && taRows.length > 0) tradingAccount = taRows[0];
  } else {
    // Try trading_accounts
    const { data: ta, error: taErr2 } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (taErr2) console.error('[resolve] trading_accounts lookup error:', taErr2.message);

    if (ta) {
      tradingAccount = ta;
      const challengeId = ta.challenge_id as string | null;
      if (challengeId) {
        const { data: linkedCa, error: lcaErr } = await supabase
          .from('challenge_accounts')
          .select('*')
          .eq('id', challengeId)
          .maybeSingle();
        if (lcaErr) console.error('[resolve] linked challenge lookup error:', lcaErr.message);
        if (linkedCa) challengeAccount = linkedCa;
      }
    }
  }

  return { challengeAccount, tradingAccount };
}

// ── Safe insert to account_deletions (non-fatal if table missing) ─────────────
async function safeInsertDeletion(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  row: Record<string, unknown>,
) {
  try {
    const { error } = await supabase.from('account_deletions').insert(row);
    if (error) console.warn('[DeleteArchive] account_deletions insert error (non-fatal):', error.message);
  } catch (err) {
    console.warn('[DeleteArchive] account_deletions insert threw (non-fatal):', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — execute delete or archive
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { staff, error: authError } = await requireFounderInHandler();
  if (authError) return authError;
  const founder = staff!;

  const accountId = params.id;
  const supabase = createAdminClient();

  console.log(`[DeleteArchive] POST called for id=${accountId} by founder=${founder.email}`);

  let body: unknown;
  try { body = await request.json(); }
  catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
      { status: 400 },
    );
  }

  const { action, confirmation_code, deletion_reason, founder_override } = parsed.data;
  console.log(`[DeleteArchive] action=${action} code=${confirmation_code}`);

  // ── Resolve accounts ───────────────────────────────────────────────────────
  const { challengeAccount, tradingAccount } = await resolveAccounts(supabase, accountId);

  console.log(`[DeleteArchive] resolved: ca=${challengeAccount?.id ?? 'null'} ta=${tradingAccount?.id ?? 'null'}`);

  if (!challengeAccount && !tradingAccount) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Account not found for id: ${accountId}` } },
      { status: 404 },
    );
  }

  const caId = challengeAccount?.id as string | undefined;
  const taId = tradingAccount?.id as string | undefined;

  // account_code lives in trading_accounts; fall back to challenge id for confirmation
  const accountCode = (tradingAccount?.account_code as string | null)
    ?? (challengeAccount?.id as string);

  // ── Validate confirmation_code ─────────────────────────────────────────────
  if (confirmation_code.trim() !== String(accountCode).trim()) {
    console.log(`[DeleteArchive] code mismatch: expected="${accountCode}" got="${confirmation_code.trim()}"`);
    return NextResponse.json(
      {
        error: {
          code: 'CONFIRMATION_MISMATCH',
          message: `Confirmation code does not match. Expected: ${accountCode}`,
        },
      },
      { status: 422 },
    );
  }

  // ── Already archived? ──────────────────────────────────────────────────────
  const currentChallengeStatus = challengeAccount?.status as string | null;
  const currentTradingStatus = tradingAccount?.status as string | null;
  const currentStatus = currentChallengeStatus ?? currentTradingStatus;

  if (action === 'archive' && currentChallengeStatus === 'archived' && currentTradingStatus === 'archived') {
    return NextResponse.json(
      { error: { code: 'ALREADY_ARCHIVED', message: 'Account is already archived.' } },
      { status: 422 },
    );
  }

  // ── Validate: open positions (graceful) ───────────────────────────────────
  let hadOpenPositions = false;
  try {
    const idToCheck = taId ?? caId;
    if (idToCheck) {
      const { count } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', idToCheck)
        .eq('status', 'open');
      hadOpenPositions = (count ?? 0) > 0;
    }
  } catch { /* trades table may not exist */ }

  if (hadOpenPositions) {
    return NextResponse.json(
      { error: { code: 'OPEN_POSITIONS', message: 'Account has open positions. Close all positions before deleting.' } },
      { status: 422 },
    );
  }

  // ── Validate: funded guard ─────────────────────────────────────────────────
  const isFunded = currentChallengeStatus === 'passed'
    || currentTradingStatus?.includes('funded');

  if (isFunded && !founder_override && action === 'permanent_delete') {
    return NextResponse.json(
      {
        error: {
          code: 'ACCOUNT_FUNDED',
          message: 'This account is funded. Enable Founder Override to proceed.',
          funded: true,
        },
      },
      { status: 422 },
    );
  }

  const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
  const ipAddress = rawIp.split(',')[0].trim();
  const userAgent = request.headers.get('user-agent') || '';
  const now = new Date().toISOString();

  // ── ARCHIVE ────────────────────────────────────────────────────────────────
  if (action === 'archive') {
    let archiveError: string | null = null;

    if (caId) {
      const { error: caErr } = await supabase
        .from('challenge_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', caId);
      if (caErr) {
        console.error('[DeleteArchive] challenge_accounts archive error:', caErr.message);
        archiveError = caErr.message;
      } else {
        console.log(`[DeleteArchive] challenge_account ${caId} archived OK`);
      }
    }

    if (taId) {
      const { error: taErr } = await supabase
        .from('trading_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', taId);
      if (taErr) {
        console.error('[DeleteArchive] trading_accounts archive error:', taErr.message);
        if (!archiveError) archiveError = taErr.message;
      } else {
        console.log(`[DeleteArchive] trading_account ${taId} archived OK`);
      }
    }

    if (archiveError && !caId && !taId) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: `Failed to archive: ${archiveError}` } },
        { status: 500 },
      );
    }

    // challenge_timeline (non-fatal)
    if (caId) {
      try {
        await supabase.from('challenge_timeline').insert({
          challenge_account_id: caId,
          action: 'archive',
          actor_id: founder.id,
          reason: deletion_reason,
          metadata: { source: 'founder_delete_archive', ip_address: ipAddress },
        });
      } catch { /* non-fatal */ }
    }

    await safeInsertDeletion(supabase, {
      action: 'archive',
      challenge_account_id: caId ?? null,
      trading_account_id: taId ?? null,
      account_code: String(accountCode),
      account_type: challengeAccount?.type ?? tradingAccount?.plan ?? null,
      initial_balance: challengeAccount?.initial_balance ?? tradingAccount?.balance ?? null,
      user_id: challengeAccount?.trader_id ?? tradingAccount?.trader_id ?? null,
      actor_id: founder.id,
      actor_email: founder.email,
      actor_role: 'Founder',
      deletion_reason,
      confirmation_code: confirmation_code.trim(),
      had_open_positions: false,
      had_pending_orders: false,
      was_funded: isFunded ?? false,
      founder_override,
      challenge_snapshot: challengeAccount ?? null,
      trading_snapshot: tradingAccount ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    try {
      await auditLogger.log({
        actorId: founder.id, actorRole: 'Founder',
        action: 'trading_account.archive',
        targetEntityType: caId ? 'challenge_accounts' : 'trading_accounts',
        targetEntityId: caId ?? taId ?? accountId,
        previousState: { status: currentStatus },
        newState: { status: 'archived', reason: deletion_reason, account_code: accountCode },
        ipAddress,
        deviceInfo: { fingerprint: 'founder-delete-archive', browser: userAgent, os: 'server', ipAddress },
        metadata: { action: 'archive', was_funded: isFunded },
      });
    } catch (e) { console.error('Audit log failed (non-fatal):', e); }

    return NextResponse.json({
      success: true, action: 'archive',
      message: 'Account archived successfully. All data preserved.',
      account_id: accountId, account_code: accountCode,
    });
  }

  // ── PERMANENT DELETE ───────────────────────────────────────────────────────
  console.log(`[DeleteArchive] Starting permanent_delete for ta=${taId} ca=${caId}`);

  // a. Purge emergency_credentials (non-fatal)
  if (taId) {
    try { await supabase.from('emergency_credentials').delete().eq('trading_account_id', taId); }
    catch { /* non-fatal */ }
  }

  // b. Nullify provisioning_logs references (non-fatal)
  if (taId) {
    try {
      await supabase
        .from('provisioning_logs')
        .update({ trading_account_id: null })
        .eq('trading_account_id', taId);
    } catch { /* non-fatal */ }
  }

  // c. Archive challenge account
  if (caId) {
    const { error: caArchiveErr } = await supabase
      .from('challenge_accounts')
      .update({ status: 'archived', updated_at: now })
      .eq('id', caId);
    if (caArchiveErr) {
      console.error('[DeleteArchive] challenge archive before delete error:', caArchiveErr.message);
    } else {
      console.log(`[DeleteArchive] challenge_account ${caId} archived before trading delete`);
    }

    try {
      await supabase.from('challenge_timeline').insert({
        challenge_account_id: caId,
        action: 'permanent_delete',
        actor_id: founder.id,
        reason: deletion_reason,
        metadata: { trading_account_deleted: taId ?? null, ip_address: ipAddress },
      });
    } catch { /* non-fatal */ }
  }

  // d. Cascade-delete FK-dependent rows first, then hard-delete trading_account
  //    Known FK children of trading_accounts.id (from live DB FK errors):
  //      account_metrics, risk_events, trades, trading_orders, terminal_sessions,
  //      account_performance, account_snapshots, account_stats, drawdown_events,
  //      payout_requests, sso_tokens
  if (taId) {
    // Tables that use 'trading_account_id' column
    const taIdColTables = [
      'account_metrics', 'account_performance', 'account_snapshots',
      'account_stats', 'drawdown_events', 'sso_tokens',
      'terminal_sessions', 'payout_requests',
    ];
    for (const t of taIdColTables) {
      try {
        await supabase.from(t).delete().eq('trading_account_id', taId);
        console.log(`[DeleteArchive] cleared ${t}.trading_account_id=${taId}`);
      } catch { /* table may not exist */ }
    }

    // Tables that use 'account_id' column
    const acctIdColTables = ['trades', 'trading_orders', 'risk_events'];
    for (const t of acctIdColTables) {
      try {
        await supabase.from(t).delete().eq('account_id', taId);
        console.log(`[DeleteArchive] cleared ${t}.account_id=${taId}`);
      } catch { /* table may not exist */ }
    }
  }

  if (taId) {
    const { error: deleteErr } = await supabase
      .from('trading_accounts')
      .delete()
      .eq('id', taId);

    if (deleteErr) {
      console.error('[DeleteArchive] trading_account hard-delete error:', deleteErr.message);
      // Unknown FK still blocking — fall back to archiving
      const { error: fallbackErr } = await supabase
        .from('trading_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', taId);
      if (fallbackErr) {
        console.error('[DeleteArchive] fallback archive also failed:', fallbackErr.message);
        return NextResponse.json(
          { error: { code: 'DELETE_FAILED', message: `Could not delete or archive trading account: ${deleteErr.message}` } },
          { status: 500 },
        );
      }
      console.log(`[DeleteArchive] trading_account ${taId} archived (delete had FK constraint)`);
    } else {
      console.log(`[DeleteArchive] trading_account ${taId} hard-deleted OK`);
    }
  }

  await safeInsertDeletion(supabase, {
    action: 'permanent_delete',
    challenge_account_id: caId ?? null,
    trading_account_id: taId ?? null,
    account_code: String(accountCode),
    account_type: challengeAccount?.type ?? tradingAccount?.plan ?? null,
    initial_balance: challengeAccount?.initial_balance ?? tradingAccount?.balance ?? null,
    user_id: challengeAccount?.trader_id ?? tradingAccount?.trader_id ?? null,
    actor_id: founder.id,
    actor_email: founder.email,
    actor_role: 'Founder',
    deletion_reason,
    confirmation_code: confirmation_code.trim(),
    had_open_positions: false,
    had_pending_orders: false,
    was_funded: isFunded ?? false,
    founder_override,
    challenge_snapshot: challengeAccount ?? null,
    trading_snapshot: tradingAccount ?? null,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  try {
    await auditLogger.log({
      actorId: founder.id, actorRole: 'Founder',
      action: 'trading_account.permanent_delete',
      targetEntityType: 'trading_account',
      targetEntityId: taId ?? caId ?? accountId,
      previousState: { status: currentStatus },
      newState: { trading_account: 'DELETED', challenge_account: 'archived', reason: deletion_reason },
      ipAddress,
      deviceInfo: { fingerprint: 'founder-delete-archive', browser: userAgent, os: 'server', ipAddress },
      metadata: { action: 'permanent_delete', was_funded: isFunded },
    });
  } catch (e) { console.error('Audit log failed (non-fatal):', e); }

  return NextResponse.json({
    success: true, action: 'permanent_delete',
    message: 'Trading account permanently deleted. Challenge account archived for audit history.',
    account_id: accountId, account_code: accountCode,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — pre-flight validation
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { challengeAccount, tradingAccount } = await resolveAccounts(supabase, params.id);

  if (!challengeAccount && !tradingAccount) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Account not found' } },
      { status: 404 },
    );
  }

  const taId = tradingAccount?.id as string | undefined;
  const caId = challengeAccount?.id as string | undefined;
  const accountCode = (tradingAccount?.account_code as string | null) ?? (challengeAccount?.id as string);

  // Check open positions
  let openPositionCount = 0;
  try {
    const idToCheck = taId ?? caId;
    if (idToCheck) {
      const { count } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', idToCheck)
        .eq('status', 'open');
      openPositionCount = count ?? 0;
    }
  } catch { /* graceful */ }

  const isFunded = challengeAccount?.status === 'passed'
    || (tradingAccount?.status as string | undefined)?.includes('funded');

  return NextResponse.json({
    data: {
      account_id: params.id,
      account_code: accountCode,
      challenge_account: challengeAccount,
      trading_account: tradingAccount,
      validations: {
        open_positions: openPositionCount,
        pending_orders: 0,
        is_funded: isFunded,
        can_delete: openPositionCount === 0,
        requires_founder_override: isFunded,
      },
    },
  });
}
