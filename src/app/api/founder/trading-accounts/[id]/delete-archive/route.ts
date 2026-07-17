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
 * VERIFIED LIVE DB FACTS (from debug scripts against production Supabase):
 *
 * trading_accounts.status CHECK: only 'active' | 'expired' are valid
 *   → cannot set 'archived'. Archive = mark as 'expired' + lock with locked_reason.
 *
 * challenge_accounts.status CHECK: only 'active' | 'failed' | 'passed' | 'expired' are valid
 *   → cannot set 'archived'. Archive = set status='failed' with fail_reason tag.
 *
 * FK children of trading_accounts.id that MUST be deleted first:
 *   → challenge_progress.trading_account_id  ← confirmed blocker
 *   → account_metrics.trading_account_id     ← confirmed in previous run
 *
 * ARCHIVE strategy:
 *   trading_account:   status='expired', locked_reason='ARCHIVED_BY_FOUNDER'
 *   challenge_account: status='failed',  fail_reason='ARCHIVED_BY_FOUNDER'
 *
 * PERMANENT DELETE strategy:
 *   1. Delete challenge_progress rows
 *   2. Delete account_metrics rows
 *   3. Delete other FK deps (trades, risk_events, etc.)
 *   4. Hard-delete trading_accounts row
 *   5. Set challenge_account status='failed', fail_reason='DELETED_BY_FOUNDER'
 */

const BodySchema = z.object({
  action: z.enum(['archive', 'permanent_delete']),
  confirmation_code: z.string().min(1, 'Confirmation code is required'),
  deletion_reason: z.string().min(20, 'Reason must be at least 20 characters'),
  founder_override: z.boolean().optional().default(false),
});

// ── Tables with FK to trading_accounts.id ─────────────────────────────────────
// Column name → table name pairs, all confirmed from live DB inspection
const FK_DEPS_TRADING_ACCOUNT_ID = [
  'challenge_progress',   // CONFIRMED blocker
  'account_metrics',      // CONFIRMED from previous run
  'account_performance',
  'account_snapshots',
  'account_stats',
  'drawdown_events',
  'payout_requests',
  'sso_tokens',
  'terminal_sessions',
];

const FK_DEPS_ACCOUNT_ID = [
  'trades',
  'trading_orders',
  'risk_events',
];

async function clearFKDeps(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  taId: string,
) {
  for (const table of FK_DEPS_TRADING_ACCOUNT_ID) {
    try {
      const { count, error } = await supabase
        .from(table).delete({ count: 'exact' }).eq('trading_account_id', taId);
      if (error) console.log(`[FK] ${table}.trading_account_id: ${error.message}`);
      else if ((count ?? 0) > 0) console.log(`[FK] cleared ${count} rows from ${table}`);
    } catch { /* table does not exist */ }
  }
  for (const table of FK_DEPS_ACCOUNT_ID) {
    try {
      await supabase.from(table).delete().eq('account_id', taId);
    } catch { /* non-fatal */ }
  }
  // Also purge emergency_credentials and nullify provisioning_logs
  try { await supabase.from('emergency_credentials').delete().eq('trading_account_id', taId); } catch { /**/ }
  try {
    await supabase.from('provisioning_logs').update({ trading_account_id: null }).eq('trading_account_id', taId);
  } catch { /**/ }
}

// ── Resolve both accounts from either ID ──────────────────────────────────────
async function resolveAccounts(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  id: string,
) {
  let challengeAccount: Record<string, unknown> | null = null;
  let tradingAccount: Record<string, unknown> | null = null;

  const { data: ca } = await supabase
    .from('challenge_accounts').select('*').eq('id', id).maybeSingle();

  if (ca) {
    challengeAccount = ca;
    const { data: taRows } = await supabase
      .from('trading_accounts').select('*').eq('challenge_id', id).limit(1);
    if (taRows && taRows.length > 0) tradingAccount = taRows[0];
  } else {
    const { data: ta } = await supabase
      .from('trading_accounts').select('*').eq('id', id).maybeSingle();
    if (ta) {
      tradingAccount = ta;
      if (ta.challenge_id) {
        const { data: linkedCa } = await supabase
          .from('challenge_accounts').select('*').eq('id', ta.challenge_id).maybeSingle();
        if (linkedCa) challengeAccount = linkedCa;
      }
    }
  }
  return { challengeAccount, tradingAccount };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST
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
  catch { return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } }, { status: 400 });
  }

  const { action, confirmation_code, deletion_reason, founder_override } = parsed.data;

  const { challengeAccount, tradingAccount } = await resolveAccounts(supabase, accountId);
  if (!challengeAccount && !tradingAccount) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 });
  }

  const caId = challengeAccount?.id as string | undefined;
  const taId = tradingAccount?.id as string | undefined;
  const accountCode = (tradingAccount?.account_code as string | null) ?? (challengeAccount?.id as string);
  const currentStatus = (challengeAccount?.status ?? tradingAccount?.status) as string | null;

  // ── Confirmation code ──────────────────────────────────────────────────────
  if (confirmation_code.trim() !== String(accountCode).trim()) {
    return NextResponse.json({
      error: { code: 'CONFIRMATION_MISMATCH', message: `Expected: ${accountCode}` },
    }, { status: 422 });
  }

  // ── Funded guard ───────────────────────────────────────────────────────────
  const isFunded = challengeAccount?.status === 'passed';
  if (isFunded && !founder_override && action === 'permanent_delete') {
    return NextResponse.json({
      error: { code: 'ACCOUNT_FUNDED', message: 'Funded account. Enable Founder Override to proceed.', funded: true },
    }, { status: 422 });
  }

  // ── Open positions (graceful) ──────────────────────────────────────────────
  let hadOpenPositions = false;
  try {
    const { count } = await supabase.from('trades')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', taId ?? caId ?? '')
      .eq('status', 'open');
    hadOpenPositions = (count ?? 0) > 0;
  } catch { /**/ }

  if (hadOpenPositions) {
    return NextResponse.json({
      error: { code: 'OPEN_POSITIONS', message: 'Close all open positions first.' },
    }, { status: 422 });
  }

  const rawIp = (request.headers.get('x-forwarded-for') || '0.0.0.0').split(',')[0].trim();
  const userAgent = request.headers.get('user-agent') || '';

  // ── ARCHIVE ────────────────────────────────────────────────────────────────
  // Valid status: trading_accounts → 'expired' | challenge_accounts → 'failed'
  // We use locked_reason / fail_reason to tag as ARCHIVED so it's distinguishable
  if (action === 'archive') {
    if (taId) {
      const { error: taErr } = await supabase
        .from('trading_accounts')
        .update({ status: 'expired', locked_reason: `ARCHIVED_BY_FOUNDER: ${deletion_reason}` })
        .eq('id', taId);
      if (taErr) {
        console.error('[Archive] trading_account update failed:', taErr.message);
        return NextResponse.json({
          error: { code: 'ARCHIVE_FAILED', message: `Archive failed: ${taErr.message}` },
        }, { status: 500 });
      }
    }

    if (caId) {
      const { error: caErr } = await supabase
        .from('challenge_accounts')
        .update({ status: 'failed', fail_reason: `ARCHIVED_BY_FOUNDER: ${deletion_reason}` })
        .eq('id', caId);
      if (caErr) console.error('[Archive] challenge_account update failed:', caErr.message);
    }

    // challenge_timeline (non-fatal)
    if (caId) {
      try {
        await supabase.from('challenge_timeline').insert({
          challenge_account_id: caId, action: 'archive',
          actor_id: founder.id, reason: deletion_reason,
          metadata: { source: 'founder_delete_archive', account_code: accountCode, ip: rawIp },
        });
      } catch { /**/ }
    }

    try {
      await auditLogger.log({
        actorId: founder.id, actorRole: 'Founder',
        action: 'trading_account.archive',
        targetEntityType: caId ? 'challenge_accounts' : 'trading_accounts',
        targetEntityId: caId ?? taId ?? accountId,
        previousState: { status: currentStatus, account_code: accountCode },
        newState: { trading_status: 'expired', challenge_status: 'failed', reason: deletion_reason, tag: 'ARCHIVED_BY_FOUNDER' },
        ipAddress: rawIp,
        deviceInfo: { fingerprint: 'founder-delete-archive', browser: userAgent, os: 'server', ipAddress: rawIp },
        metadata: { action: 'archive', founder: founder.email },
      });
    } catch (e) { console.error('Audit log failed:', e); }

    return NextResponse.json({
      success: true, action: 'archive',
      message: 'Account archived. Trading account set to expired. Challenge account set to failed. All data preserved.',
      account_id: accountId, account_code: accountCode,
    });
  }

  // ── PERMANENT DELETE ───────────────────────────────────────────────────────
  // 1. Clear all FK deps
  if (taId) await clearFKDeps(supabase, taId);

  // 2. Hard-delete trading account
  let deleted = false;
  if (taId) {
    const { error: delErr } = await supabase.from('trading_accounts').delete().eq('id', taId);
    if (delErr) {
      console.error('[Delete] trading_account delete failed:', delErr.message);
      // Still has unknown FKs — fall back to expired+locked
      const { error: expErr } = await supabase
        .from('trading_accounts')
        .update({ status: 'expired', locked_reason: `DELETED_BY_FOUNDER: ${deletion_reason}` })
        .eq('id', taId);
      if (expErr) {
        return NextResponse.json({
          error: { code: 'DELETE_FAILED', message: `Failed to delete or expire trading account: ${delErr.message}` },
        }, { status: 500 });
      }
      console.log(`[Delete] trading_account ${taId} set to expired (delete blocked by unknown FK)`);
    } else {
      deleted = true;
      console.log(`[Delete] trading_account ${taId} hard-deleted`);
    }
  }

  // 3. Mark challenge account as failed (permanent signal)
  if (caId) {
    const { error: caErr } = await supabase
      .from('challenge_accounts')
      .update({ status: 'failed', fail_reason: `DELETED_BY_FOUNDER: ${deletion_reason}` })
      .eq('id', caId);
    if (caErr) console.error('[Delete] challenge_account update failed:', caErr.message);
    else console.log(`[Delete] challenge_account ${caId} marked as failed`);

    try {
      await supabase.from('challenge_timeline').insert({
        challenge_account_id: caId, action: 'permanent_delete',
        actor_id: founder.id, reason: deletion_reason,
        metadata: { trading_account_id: taId, deleted, account_code: accountCode, ip: rawIp },
      });
    } catch { /**/ }
  }

  try {
    await auditLogger.log({
      actorId: founder.id, actorRole: 'Founder',
      action: 'trading_account.permanent_delete',
      targetEntityType: 'trading_account',
      targetEntityId: taId ?? caId ?? accountId,
      previousState: { status: currentStatus, account_code: accountCode },
      newState: { trading_account: deleted ? 'HARD_DELETED' : 'expired+locked', challenge_account: 'failed', reason: deletion_reason },
      ipAddress: rawIp,
      deviceInfo: { fingerprint: 'founder-delete-archive', browser: userAgent, os: 'server', ipAddress: rawIp },
      metadata: { action: 'permanent_delete', founder: founder.email, hard_deleted: deleted },
    });
  } catch (e) { console.error('Audit log failed:', e); }

  return NextResponse.json({
    success: true, action: 'permanent_delete',
    message: deleted
      ? 'Trading account permanently deleted. Challenge account marked failed for audit history.'
      : 'Trading account disabled and locked. Challenge account marked failed.',
    account_id: accountId, account_code: accountCode, hard_deleted: deleted,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — pre-flight
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
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 });
  }

  const taId = tradingAccount?.id as string | undefined;
  const caId = challengeAccount?.id as string | undefined;
  const accountCode = (tradingAccount?.account_code as string | null) ?? (challengeAccount?.id as string);

  let openPositionCount = 0;
  try {
    const { count } = await supabase.from('trades')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', taId ?? caId ?? '').eq('status', 'open');
    openPositionCount = count ?? 0;
  } catch { /**/ }

  const isFunded = challengeAccount?.status === 'passed';

  return NextResponse.json({
    data: {
      account_id: params.id, account_code: accountCode,
      challenge_account: challengeAccount,
      trading_account: tradingAccount,
      validations: {
        open_positions: openPositionCount, pending_orders: 0,
        is_funded: isFunded, can_delete: openPositionCount === 0,
        requires_founder_override: isFunded,
      },
    },
  });
}
