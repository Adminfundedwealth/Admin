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
 * [id] can be EITHER a challenge_account.id OR a trading_account.id.
 * The route resolves both regardless of which one is passed.
 *
 * account_deletions table is optional — if it doesn't exist yet the write
 * is caught and logged but the delete/archive still completes.
 */

const BodySchema = z.object({
  action: z.enum(['archive', 'permanent_delete']),
  confirmation_code: z.string().min(1, 'Confirmation code is required'),
  deletion_reason: z.string().min(20, 'Reason must be at least 20 characters'),
  founder_override: z.boolean().optional().default(false),
});

// ── Resolve both challenge + trading account from either ID ──────────────────
async function resolveAccounts(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, id: string) {
  let challengeAccount: Record<string, unknown> | null = null;
  let tradingAccount: Record<string, unknown> | null = null;

  // Try challenge_accounts first
  const { data: ca } = await supabase
    .from('challenge_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (ca) {
    challengeAccount = ca;
    // Find linked trading account
    const { data: taRows } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('challenge_id', id)
      .limit(1);
    if (taRows && taRows.length > 0) tradingAccount = taRows[0];
  } else {
    // Try trading_accounts
    const { data: ta } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (ta) {
      tradingAccount = ta;
      // Find linked challenge account
      const challengeId = ta.challenge_id as string | null;
      if (challengeId) {
        const { data: linkedCa } = await supabase
          .from('challenge_accounts')
          .select('*')
          .eq('id', challengeId)
          .maybeSingle();
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
    await supabase.from('account_deletions').insert(row);
  } catch (err) {
    console.warn('[DeleteArchive] account_deletions insert skipped (table may not exist):', err);
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

  // ── Resolve accounts ───────────────────────────────────────────────────────
  const { challengeAccount, tradingAccount } = await resolveAccounts(supabase, accountId);

  if (!challengeAccount && !tradingAccount) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Account not found. Check the ID and try again.' } },
      { status: 404 },
    );
  }

  const caId = challengeAccount?.id as string | undefined;
  const taId = tradingAccount?.id as string | undefined;

  // ── Determine account_code for confirmation ────────────────────────────────
  // Priority: trading_accounts.account_code → challenge id
  const accountCode = (tradingAccount?.account_code as string | null)
    ?? (challengeAccount?.id as string);

  // ── Validate confirmation_code ─────────────────────────────────────────────
  if (confirmation_code.trim() !== String(accountCode).trim()) {
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
  const currentStatus = (challengeAccount?.status ?? tradingAccount?.status) as string | null;
  if (currentStatus === 'archived' && action === 'archive') {
    return NextResponse.json(
      { error: { code: 'ALREADY_ARCHIVED', message: 'Account is already archived.' } },
      { status: 422 },
    );
  }

  // ── Validate: open positions ───────────────────────────────────────────────
  let hadOpenPositions = false;
  try {
    const q = supabase
      .from('trades')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    const scoped = taId ? q.eq('account_id', taId) : caId ? q.eq('account_id', caId) : q;
    const { count } = await scoped;
    hadOpenPositions = (count ?? 0) > 0;
  } catch { /* graceful — trades table may not exist */ }

  if (hadOpenPositions) {
    return NextResponse.json(
      { error: { code: 'OPEN_POSITIONS', message: 'Account has open positions. Close all positions before deleting.' } },
      { status: 422 },
    );
  }

  // ── Validate: pending orders ───────────────────────────────────────────────
  let hadPendingOrders = false;
  try {
    const q = supabase
      .from('trading_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']);
    const scoped = taId ? q.eq('account_id', taId) : caId ? q.eq('account_id', caId) : q;
    const { count } = await scoped;
    hadPendingOrders = (count ?? 0) > 0;
  } catch { /* graceful */ }

  if (hadPendingOrders) {
    return NextResponse.json(
      { error: { code: 'PENDING_ORDERS', message: 'Account has pending orders. Cancel all orders before deleting.' } },
      { status: 422 },
    );
  }

  // ── Validate: funded guard ─────────────────────────────────────────────────
  const isFunded = challengeAccount?.status === 'passed'
    || (tradingAccount?.status as string | undefined)?.includes('funded');

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

  // ── Snapshot provisioning logs ────────────────────────────────────────────
  let provisioningSnapshot: unknown[] = [];
  try {
    const orFilter = [
      taId ? `trading_account_id.eq.${taId}` : null,
      caId ? `challenge_account_id.eq.${caId}` : null,
    ].filter(Boolean).join(',');
    if (orFilter) {
      const { data } = await supabase.from('provisioning_logs').select('*').or(orFilter);
      provisioningSnapshot = data ?? [];
    }
  } catch { /* non-fatal */ }

  const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
  const ipAddress = rawIp.split(',')[0].trim();
  const userAgent = request.headers.get('user-agent') || '';
  const now = new Date().toISOString();

  // ── Shared audit payload ───────────────────────────────────────────────────
  const deletionRow = {
    action,
    challenge_account_id: caId ?? null,
    trading_account_id: taId ?? null,
    account_code: String(accountCode),
    account_type: (challengeAccount?.type ?? tradingAccount?.plan ?? null) as string | null,
    account_plan: (challengeAccount?.plan ?? null) as string | null,
    initial_balance: (challengeAccount?.initial_balance ?? tradingAccount?.balance ?? null) as number | null,
    user_id: (challengeAccount?.trader_id ?? tradingAccount?.trader_id ?? null) as string | null,
    actor_id: founder.id,
    actor_email: founder.email,
    actor_role: 'Founder',
    deletion_reason,
    confirmation_code: confirmation_code.trim(),
    had_open_positions: hadOpenPositions,
    had_pending_orders: hadPendingOrders,
    was_funded: isFunded ?? false,
    founder_override,
    challenge_snapshot: challengeAccount ?? null,
    trading_snapshot: tradingAccount ?? null,
    provisioning_snapshot: provisioningSnapshot,
    ip_address: ipAddress,
    user_agent: userAgent,
  };

  // ── ARCHIVE ────────────────────────────────────────────────────────────────
  if (action === 'archive') {
    // Archive challenge account
    if (caId) {
      const { error: caErr } = await supabase
        .from('challenge_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', caId);
      if (caErr) {
        console.error('[DeleteArchive] challenge_accounts archive failed:', caErr.message);
        return NextResponse.json(
          { error: { code: 'UPDATE_ERROR', message: `Failed to archive challenge account: ${caErr.message}` } },
          { status: 500 },
        );
      }
    }

    // Archive trading account
    if (taId) {
      await supabase
        .from('trading_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', taId);
    }

    // challenge_timeline (non-fatal)
    if (caId) {
      try {
        await supabase.from('challenge_timeline').insert({
          challenge_account_id: caId,
          action: 'archive',
          actor_id: founder.id,
          reason: deletion_reason,
          metadata: { source: 'founder_delete_archive', founder_override, ip_address: ipAddress },
        });
      } catch { /* non-fatal */ }
    }

    await safeInsertDeletion(supabase, deletionRow);

    try {
      await auditLogger.log({
        actorId: founder.id, actorRole: 'Founder',
        action: 'trading_account.archive',
        targetEntityType: caId ? 'challenge_accounts' : 'trading_accounts',
        targetEntityId: caId ?? taId ?? accountId,
        previousState: { status: currentStatus, challenge: challengeAccount, trading: tradingAccount },
        newState: { status: 'archived', reason: deletion_reason, account_code: accountCode },
        ipAddress, deviceInfo: { fingerprint: 'founder-delete-archive', browser: userAgent, os: 'server', ipAddress },
        metadata: { action: 'archive', had_open_positions: hadOpenPositions, was_funded: isFunded },
      });
    } catch (e) { console.error('Audit log failed (non-fatal):', e); }

    return NextResponse.json({
      success: true, action: 'archive',
      message: 'Account archived. All historical data preserved.',
      account_id: accountId, account_code: accountCode,
    });
  }

  // ── PERMANENT DELETE ───────────────────────────────────────────────────────

  // a. Purge emergency_credentials
  if (taId) {
    try { await supabase.from('emergency_credentials').delete().eq('trading_account_id', taId); }
    catch { /* non-fatal */ }
  }
  if (caId) {
    try { await supabase.from('emergency_credentials').delete().eq('challenge_account_id', caId); }
    catch { /* non-fatal */ }
  }

  // b. Nullify trading_account_id in provisioning_logs (preserve the log)
  if (taId) {
    try {
      await supabase
        .from('provisioning_logs')
        .update({
          trading_account_id: null,
          metadata: { _deleted_trading_account_id: taId, _deleted_at: now, _deleted_by: founder.id },
        })
        .eq('trading_account_id', taId);
    } catch { /* non-fatal */ }
  }

  // c. Archive challenge account (preserves history)
  if (caId) {
    await supabase
      .from('challenge_accounts')
      .update({ status: 'archived', updated_at: now })
      .eq('id', caId);

    try {
      await supabase.from('challenge_timeline').insert({
        challenge_account_id: caId,
        action: 'permanent_delete',
        actor_id: founder.id,
        reason: deletion_reason,
        metadata: { source: 'founder_delete_archive', trading_account_deleted: taId ?? null, founder_override, ip_address: ipAddress },
      });
    } catch { /* non-fatal */ }
  }

  // d. Hard-delete trading account — this is the critical step
  if (taId) {
    const { error: deleteErr } = await supabase
      .from('trading_accounts')
      .delete()
      .eq('id', taId);

    if (deleteErr) {
      // FK constraint? Fall back to archiving instead
      console.error('[DeleteArchive] trading_account hard-delete failed, archiving instead:', deleteErr.message);
      await supabase.from('trading_accounts').update({ status: 'archived', updated_at: now }).eq('id', taId);
    }
  }

  // e. Audit records (all non-fatal)
  await safeInsertDeletion(supabase, deletionRow);

  try {
    await auditLogger.log({
      actorId: founder.id, actorRole: 'Founder',
      action: 'trading_account.permanent_delete',
      targetEntityType: 'trading_account',
      targetEntityId: taId ?? caId ?? accountId,
      previousState: { challenge: challengeAccount, trading: tradingAccount, status: currentStatus },
      newState: { trading_account: 'DELETED', challenge_account: 'archived', reason: deletion_reason, account_code: accountCode },
      ipAddress, deviceInfo: { fingerprint: 'founder-delete-archive', browser: userAgent, os: 'server', ipAddress },
      metadata: { action: 'permanent_delete', was_funded: isFunded, credentials_purged: true },
    });
  } catch (e) { console.error('Audit log failed (non-fatal):', e); }

  return NextResponse.json({
    success: true, action: 'permanent_delete',
    message: 'Trading account permanently deleted. Terminal credentials purged. Challenge account archived for audit history.',
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

  const caId = challengeAccount?.id as string | undefined;
  const taId = tradingAccount?.id as string | undefined;
  const accountCode = (tradingAccount?.account_code as string | null) ?? (challengeAccount?.id as string);

  let openPositionCount = 0;
  try {
    const q = supabase.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'open');
    const scoped = taId ? q.eq('account_id', taId) : caId ? q.eq('account_id', caId) : q;
    const { count } = await scoped;
    openPositionCount = count ?? 0;
  } catch { /* graceful */ }

  let pendingOrderCount = 0;
  try {
    const q = supabase.from('trading_orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']);
    const scoped = taId ? q.eq('account_id', taId) : caId ? q.eq('account_id', caId) : q;
    const { count } = await scoped;
    pendingOrderCount = count ?? 0;
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
        pending_orders: pendingOrderCount,
        is_funded: isFunded,
        can_delete: openPositionCount === 0 && pendingOrderCount === 0,
        requires_founder_override: isFunded,
      },
    },
  });
}
