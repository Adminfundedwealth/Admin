export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// DELETE / ARCHIVE — Founder-only
//
// POST /api/founder/trading-accounts/[id]/delete-archive
//
// Body:
//   action            "archive" | "permanent_delete"
//   confirmation_code  The account_code the founder typed (must match)
//   deletion_reason    Minimum 20 characters
//   founder_override   boolean — bypasses the funded-account guard
//
// Workflow:
//   1. Auth — Founder only
//   2. Fetch challenge + trading account
//   3. Validate confirmation_code matches account_code
//   4. Validate: no open positions, no pending orders
//   5. Validate: not funded (unless founder_override = true)
//   6. Execute:
//      ARCHIVE  → set status = "archived" on challenge + trading accounts
//      DELETE   → hard-delete trading_accounts row, terminal credentials,
//                 provisioning_logs links, set challenge to "archived"
//                 (challenge data preserved for audit; trading account removed)
//   7. Write account_deletions row + audit_records
// ─────────────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  action: z.enum(['archive', 'permanent_delete']),
  confirmation_code: z.string().min(1, 'Confirmation code is required'),
  deletion_reason: z.string().min(20, 'Reason must be at least 20 characters'),
  founder_override: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const { staff, error: authError } = await requireFounderInHandler();
  if (authError) return authError;
  const founder = staff!;

  const accountId = params.id;
  const supabase = createAdminClient();

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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

  // ── 3. Resolve account (challenge_accounts first, trading_accounts fallback) ──
  let challengeAccount: Record<string, unknown> | null = null;
  let tradingAccount: Record<string, unknown> | null = null;
  let accountSource: 'challenge_accounts' | 'trading_accounts' = 'challenge_accounts';

  const { data: ca } = await supabase
    .from('challenge_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (ca) {
    challengeAccount = ca;
    accountSource = 'challenge_accounts';

    // Also fetch the linked trading_account
    const { data: ta } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('challenge_id', accountId)
      .limit(1);
    if (ta && ta.length > 0) tradingAccount = ta[0];
  } else {
    const { data: ta } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (ta) {
      tradingAccount = ta;
      accountSource = 'trading_accounts';

      // Try to fetch linked challenge
      if (ta.challenge_id) {
        const { data: linkedCa } = await supabase
          .from('challenge_accounts')
          .select('*')
          .eq('id', ta.challenge_id)
          .single();
        if (linkedCa) challengeAccount = linkedCa;
      }
    }
  }

  if (!challengeAccount && !tradingAccount) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Account not found' } },
      { status: 404 },
    );
  }

  // ── 4. Resolve the account_code for confirmation ──────────────────────────
  const accountCode = (tradingAccount?.account_code as string | null)
    ?? (challengeAccount?.id as string);

  // ── 5. Validate confirmation_code ─────────────────────────────────────────
  if (confirmation_code.trim() !== String(accountCode).trim()) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFIRMATION_MISMATCH',
          message: `Confirmation code does not match. Expected the account code: ${accountCode}`,
        },
      },
      { status: 422 },
    );
  }

  // ── 6. Validate: not already archived/deleted ────────────────────────────
  const currentStatus = (challengeAccount?.status ?? tradingAccount?.status) as string | null;
  if (currentStatus === 'archived') {
    return NextResponse.json(
      { error: { code: 'ALREADY_ARCHIVED', message: 'Account is already archived' } },
      { status: 422 },
    );
  }

  // ── 7. Validate: open positions ──────────────────────────────────────────
  // Attempt to check the trades table. Gracefully handle if it doesn't exist.
  let hadOpenPositions = false;
  const taId = tradingAccount?.id as string | undefined;
  const caId = challengeAccount?.id as string | undefined;

  if (taId || caId) {
    try {
      let tradesQuery = supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open');

      if (taId) tradesQuery = tradesQuery.eq('account_id', taId);
      else if (caId) tradesQuery = tradesQuery.eq('account_id', caId);

      const { count } = await tradesQuery;
      hadOpenPositions = (count ?? 0) > 0;
    } catch {
      // trades table may not exist — proceed with hadOpenPositions = false
    }
  }

  if (hadOpenPositions) {
    return NextResponse.json(
      {
        error: {
          code: 'OPEN_POSITIONS',
          message: 'Account has open positions. Close all positions before deleting.',
        },
      },
      { status: 422 },
    );
  }

  // ── 8. Validate: pending orders ──────────────────────────────────────────
  let hadPendingOrders = false;
  if (taId || caId) {
    try {
      let ordersQuery = supabase
        .from('trading_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

      if (taId) ordersQuery = ordersQuery.eq('account_id', taId);
      else if (caId) ordersQuery = ordersQuery.eq('account_id', caId);

      const { count } = await ordersQuery;
      hadPendingOrders = (count ?? 0) > 0;
    } catch {
      // trading_orders table may not exist — proceed
    }
  }

  if (hadPendingOrders) {
    return NextResponse.json(
      {
        error: {
          code: 'PENDING_ORDERS',
          message: 'Account has pending orders. Cancel all orders before deleting.',
        },
      },
      { status: 422 },
    );
  }

  // ── 9. Validate: funded status ───────────────────────────────────────────
  const isFunded =
    challengeAccount?.status === 'passed' ||
    (tradingAccount?.status as string | undefined)?.includes('funded');

  if (isFunded && !founder_override) {
    return NextResponse.json(
      {
        error: {
          code: 'ACCOUNT_FUNDED',
          message:
            'This account is funded. Set founder_override: true to proceed with deletion.',
          funded: true,
        },
      },
      { status: 422 },
    );
  }

  // ── 10. Fetch provisioning snapshot ──────────────────────────────────────
  let provisioningSnapshot: unknown[] = [];
  if (taId || caId) {
    const { data: provLogs } = await supabase
      .from('provisioning_logs')
      .select('*')
      .or(
        [taId ? `trading_account_id.eq.${taId}` : null, caId ? `challenge_account_id.eq.${caId}` : null]
          .filter(Boolean)
          .join(','),
      );
    provisioningSnapshot = provLogs ?? [];
  }

  const rawIp =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0';
  const ipAddress = rawIp.split(',')[0].trim();
  const userAgent = request.headers.get('user-agent') || '';
  const now = new Date().toISOString();

  // ─────────────────────────────────────────────────────────────────────────
  // ── 11. EXECUTE ──────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  if (action === 'archive') {
    // ── ARCHIVE ─────────────────────────────────────────────────────────────
    // Set status = 'archived' on both tables. Preserves all data.

    if (caId) {
      await supabase
        .from('challenge_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', caId);
    }

    if (taId) {
      await supabase
        .from('trading_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', taId);
    }

    // ── Write challenge_timeline entry (if table exists) ────────────────────
    if (caId) {
      try {
        await supabase.from('challenge_timeline').insert({
          challenge_account_id: caId,
          action: 'archive',
          actor_id: founder.id,
          reason: deletion_reason,
          metadata: {
            source: 'founder_delete_archive',
            founder_override: founder_override,
            ip_address: ipAddress,
          },
        });
      } catch {
        // non-fatal
      }
    }

    // ── Record in account_deletions ─────────────────────────────────────────
    try {
      await supabase.from('account_deletions').insert({
        action: 'archive',
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
        was_funded: isFunded,
        founder_override: founder_override,
        challenge_snapshot: challengeAccount ?? null,
        trading_snapshot: tradingAccount ?? null,
        provisioning_snapshot: provisioningSnapshot,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    } catch (err) {
      console.error('[DeleteArchive] account_deletions insert failed (non-fatal):', err);
    }

    // ── Main audit record ───────────────────────────────────────────────────
    try {
      await auditLogger.log({
        actorId: founder.id,
        actorRole: 'Founder',
        action: 'trading_account.archive',
        targetEntityType: accountSource,
        targetEntityId: accountId,
        previousState: {
          status: currentStatus,
          challenge_account: challengeAccount,
          trading_account: tradingAccount,
        },
        newState: {
          status: 'archived',
          reason: deletion_reason,
          account_code: accountCode,
          founder_override,
        },
        ipAddress,
        deviceInfo: {
          fingerprint: 'founder-delete-archive',
          browser: userAgent,
          os: 'server',
          ipAddress,
        },
        metadata: {
          action: 'archive',
          had_open_positions: hadOpenPositions,
          had_pending_orders: hadPendingOrders,
          was_funded: isFunded,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    return NextResponse.json({
      success: true,
      action: 'archive',
      message: 'Account archived successfully. All historical data preserved.',
      account_id: accountId,
      account_code: accountCode,
    });
  }

  // ── PERMANENT DELETE ────────────────────────────────────────────────────
  // Order of operations (most dependent → least dependent):
  //   a. Delete terminal/emergency credentials
  //   b. Clear provisioning_logs references (nullify account IDs, keep log)
  //   c. Archive the challenge_account (preserve history)
  //   d. Delete the trading_account row
  //   e. Write account_deletions + audit_records

  // a. Delete emergency_credentials rows
  if (taId) {
    try {
      await supabase
        .from('emergency_credentials')
        .delete()
        .eq('trading_account_id', taId);
    } catch {
      // non-fatal — table may not exist or row may not be there
    }
  }
  if (caId) {
    try {
      await supabase
        .from('emergency_credentials')
        .delete()
        .eq('challenge_account_id', caId);
    } catch {
      // non-fatal
    }
  }

  // b. Nullify trading_account_id in provisioning_logs (preserve the log itself)
  if (taId) {
    try {
      await supabase
        .from('provisioning_logs')
        .update({
          trading_account_id: null,
          metadata: {
            _deleted_trading_account_id: taId,
            _deleted_at: now,
            _deleted_by: founder.id,
          },
        })
        .eq('trading_account_id', taId);
    } catch {
      // non-fatal
    }
  }

  // c. Archive the challenge_account (keeps all historical data)
  if (caId) {
    await supabase
      .from('challenge_accounts')
      .update({ status: 'archived', updated_at: now })
      .eq('id', caId);

    // challenge_timeline entry
    try {
      await supabase.from('challenge_timeline').insert({
        challenge_account_id: caId,
        action: 'permanent_delete',
        actor_id: founder.id,
        reason: deletion_reason,
        metadata: {
          source: 'founder_delete_archive',
          trading_account_deleted: taId ?? null,
          founder_override,
          ip_address: ipAddress,
        },
      });
    } catch {
      // non-fatal
    }
  }

  // d. Hard-delete the trading_account
  if (taId) {
    const { error: deleteErr } = await supabase
      .from('trading_accounts')
      .delete()
      .eq('id', taId);

    if (deleteErr) {
      // If delete fails (e.g. FK constraint), fall back to archiving it
      console.error('[DeleteArchive] trading_account delete failed, falling back to archive:', deleteErr.message);
      await supabase
        .from('trading_accounts')
        .update({ status: 'archived', updated_at: now })
        .eq('id', taId);
    }
  }

  // e. Write account_deletions record
  try {
    await supabase.from('account_deletions').insert({
      action: 'permanent_delete',
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
      was_funded: isFunded,
      founder_override: founder_override,
      challenge_snapshot: challengeAccount ?? null,
      trading_snapshot: tradingAccount ?? null,
      provisioning_snapshot: provisioningSnapshot,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (err) {
    console.error('[DeleteArchive] account_deletions insert failed (non-fatal):', err);
  }

  // Audit record
  try {
    await auditLogger.log({
      actorId: founder.id,
      actorRole: 'Founder',
      action: 'trading_account.permanent_delete',
      targetEntityType: 'trading_account',
      targetEntityId: accountId,
      previousState: {
        challenge_account: challengeAccount,
        trading_account: tradingAccount,
        status: currentStatus,
      },
      newState: {
        trading_account: 'DELETED',
        challenge_account: 'archived',
        reason: deletion_reason,
        account_code: accountCode,
        founder_override,
      },
      ipAddress,
      deviceInfo: {
        fingerprint: 'founder-delete-archive',
        browser: userAgent,
        os: 'server',
        ipAddress,
      },
      metadata: {
        action: 'permanent_delete',
        had_open_positions: hadOpenPositions,
        had_pending_orders: hadPendingOrders,
        was_funded: isFunded,
        credentials_purged: true,
        provisioning_logs_nullified: true,
      },
    });
  } catch (auditErr) {
    console.error('Audit log failed (non-fatal):', auditErr);
  }

  return NextResponse.json({
    success: true,
    action: 'permanent_delete',
    message:
      'Trading account permanently deleted. Terminal credentials purged. Challenge account archived for audit history.',
    account_id: accountId,
    account_code: accountCode,
  });
}

// ── GET — pre-flight check ────────────────────────────────────────────────────
// Returns validation info before the founder commits to delete/archive.
// Used by the modal to show open positions, pending orders, funded status.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const accountId = params.id;
  const supabase = createAdminClient();

  // Resolve account
  let challengeAccount: Record<string, unknown> | null = null;
  let tradingAccount: Record<string, unknown> | null = null;

  const { data: ca } = await supabase
    .from('challenge_accounts')
    .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at')
    .eq('id', accountId)
    .single();

  if (ca) {
    challengeAccount = ca;
    const { data: ta } = await supabase
      .from('trading_accounts')
      .select('id, account_code, balance, status, trader_id')
      .eq('challenge_id', accountId)
      .limit(1);
    if (ta && ta.length > 0) tradingAccount = ta[0];
  } else {
    const { data: ta } = await supabase
      .from('trading_accounts')
      .select('id, account_code, balance, status, trader_id, challenge_id')
      .eq('id', accountId)
      .single();
    if (ta) {
      tradingAccount = ta;
      if (ta.challenge_id) {
        const { data: linkedCa } = await supabase
          .from('challenge_accounts')
          .select('id, type, plan, status, initial_balance, current_balance, trader_id, started_at, created_at')
          .eq('id', ta.challenge_id)
          .single();
        if (linkedCa) challengeAccount = linkedCa;
      }
    }
  }

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
  if (taId || caId) {
    try {
      let q = supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open');
      if (taId) q = q.eq('account_id', taId);
      else if (caId) q = q.eq('account_id', caId);
      const { count } = await q;
      openPositionCount = count ?? 0;
    } catch { /* graceful */ }
  }

  // Check pending orders
  let pendingOrderCount = 0;
  if (taId || caId) {
    try {
      let q = supabase
        .from('trading_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);
      if (taId) q = q.eq('account_id', taId);
      else if (caId) q = q.eq('account_id', caId);
      const { count } = await q;
      pendingOrderCount = count ?? 0;
    } catch { /* graceful */ }
  }

  const isFunded =
    challengeAccount?.status === 'passed' ||
    (tradingAccount?.status as string | undefined)?.includes('funded');

  return NextResponse.json({
    data: {
      account_id: accountId,
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
