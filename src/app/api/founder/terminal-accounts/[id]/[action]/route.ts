export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLogger } from '@/lib/audit/logger';

type Params = { params: Promise<{ id: string; action: string }> };

/**
 * Direct Supabase implementation for per-account admin actions.
 * No dependency on the terminal backend API — reads/writes Supabase directly.
 *
 * GET  /api/founder/terminal-accounts/[id]/detail
 * GET  /api/founder/terminal-accounts/[id]/positions
 * GET  /api/founder/terminal-accounts/[id]/risk-events
 * POST /api/founder/terminal-accounts/[id]/freeze
 * POST /api/founder/terminal-accounts/[id]/unfreeze
 * POST /api/founder/terminal-accounts/[id]/close-positions
 */

export async function GET(_request: NextRequest, { params }: Params) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const { id, action } = await params;
  const supabase = createAdminClient();

  try {
    if (action === 'detail') {
      const { data: account, error: acctErr } = await supabase
        .from('trading_accounts')
        .select('id, account_code, balance, status, locked_reason, locked_at, trader_id')
        .eq('id', id)
        .single();

      if (acctErr || !account) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 });
      }

      const { data: trader } = await supabase
        .from('terminal_traders')
        .select('id, email, display_name')
        .eq('id', account.trader_id)
        .single();

      const { data: challengeAccount } = await supabase
        .from('challenge_accounts')
        .select('id, plan, type, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, status')
        .eq('id', (
          await supabase
            .from('trading_accounts')
            .select('challenge_id')
            .eq('id', id)
            .single()
        ).data?.challenge_id ?? '')
        .single();

      const { data: positions } = await supabase
        .from('positions')
        .select('id, symbol, side, qty, product_type, avg_price, is_open, opened_at')
        .eq('trading_account_id', id)
        .eq('is_open', true)
        .order('opened_at', { ascending: false });

      return NextResponse.json({
        account,
        trader: trader ?? null,
        positions: positions ?? [],
        challenge: challengeAccount
          ? {
              plan: challengeAccount.plan,
              phase: challengeAccount.type,
              daily_loss_limit_pct: challengeAccount.daily_loss_limit_pct,
              max_drawdown_pct: challengeAccount.max_drawdown_pct,
              profit_target_pct: challengeAccount.profit_target_pct,
              status: challengeAccount.status,
            }
          : null,
      });
    }

    if (action === 'positions') {
      const { data: positions, error } = await supabase
        .from('positions')
        .select('id, symbol, side, qty, product_type, avg_price, is_open, opened_at')
        .eq('trading_account_id', id)
        .eq('is_open', true)
        .order('opened_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ positions: positions ?? [] });
    }

    if (action === 'risk-events') {
      const { data: events, error } = await supabase
        .from('risk_events')
        .select('event_type, severity, rule_type, metadata, created_at')
        .eq('trading_account_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return NextResponse.json({ events: events ?? [] });
    }

    return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } }, { status: 404 });
  } catch (err) {
    console.error(`[terminal-accounts] GET ${action} error:`, err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch data' } }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { staff, error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const { id, action } = await params;
  const supabase = createAdminClient();

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  try {
    // ── Fetch current account ──────────────────────────────────────────────
    const { data: account, error: fetchErr } = await supabase
      .from('trading_accounts')
      .select('id, account_code, status, locked_reason')
      .eq('id', id)
      .single();

    if (fetchErr || !account) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 });
    }

    const now = new Date().toISOString();

    // ── FREEZE ─────────────────────────────────────────────────────────────
    if (action === 'freeze') {
      const reason = (body.reason as string)?.trim();
      if (!reason) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'reason is required' } }, { status: 400 });
      }
      if (account.status === 'locked') {
        return NextResponse.json({ error: { code: 'ALREADY_FROZEN', message: 'Account already frozen' } }, { status: 409 });
      }

      const { error: updateErr } = await supabase
        .from('trading_accounts')
        .update({ status: 'locked', locked_reason: reason, locked_at: now, updated_at: now })
        .eq('id', id);

      if (updateErr) throw updateErr;

      await logAction(staff!, supabase, 'account.freeze', id, account, { status: 'locked', locked_reason: reason }, request);

      return NextResponse.json({
        success: true,
        message: `Account ${account.account_code} frozen`,
        status: 'locked',
      });
    }

    // ── UNFREEZE ───────────────────────────────────────────────────────────
    if (action === 'unfreeze') {
      if (account.status === 'active') {
        return NextResponse.json({ error: { code: 'ALREADY_ACTIVE', message: 'Account already active' } }, { status: 409 });
      }

      const { error: updateErr } = await supabase
        .from('trading_accounts')
        .update({ status: 'active', locked_reason: null, locked_at: null, updated_at: now })
        .eq('id', id);

      if (updateErr) throw updateErr;

      await logAction(staff!, supabase, 'account.unfreeze', id, account, { status: 'active' }, request);

      return NextResponse.json({
        success: true,
        message: `Account ${account.account_code} unfrozen — trading restored`,
        previousStatus: account.status,
      });
    }

    // ── CLOSE POSITIONS ────────────────────────────────────────────────────
    if (action === 'close-positions') {
      const { data: openPositions, error: posErr } = await supabase
        .from('positions')
        .select('id, symbol, side, qty')
        .eq('trading_account_id', id)
        .eq('is_open', true);

      if (posErr) throw posErr;

      const positions = openPositions ?? [];
      if (positions.length > 0) {
        const { error: closeErr } = await supabase
          .from('positions')
          .update({ is_open: false, closed_at: now, close_reason: 'admin_force_close', updated_at: now })
          .eq('trading_account_id', id)
          .eq('is_open', true);

        if (closeErr) throw closeErr;
      }

      await logAction(staff!, supabase, 'account.close_positions', id, account, { closed: positions.length }, request);

      return NextResponse.json({
        success: true,
        message: `Closed ${positions.length} position(s) for ${account.account_code}`,
        closed: positions.length,
        positions,
      });
    }

    return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } }, { status: 404 });

  } catch (err) {
    console.error(`[terminal-accounts] POST ${action} error:`, err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Action failed' } }, { status: 500 });
  }
}

// ── Audit helper ─────────────────────────────────────────────────────────────
async function logAction(
  staff: { id: string; roles: string[] },
  supabase: ReturnType<typeof createAdminClient>,
  action: string,
  accountId: string,
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>,
  request: NextRequest,
) {
  try {
    await auditLogger.log({
      actorId: staff.id,
      actorRole: staff.roles[0] || 'Founder',
      action,
      targetEntityType: 'trading_account',
      targetEntityId: accountId,
      previousState,
      newState,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0',
      deviceInfo: {
        fingerprint: 'founder-account-control',
        browser: request.headers.get('user-agent') || 'unknown',
        os: 'server',
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0',
      },
    });
  } catch (e) {
    console.error('Audit log failed (non-fatal):', e);
  }
}
