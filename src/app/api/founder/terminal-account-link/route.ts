export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auditLogger } from '@/lib/audit/logger';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { createAdminClient } from '@/lib/supabase/admin';

const TERMINAL_API_URL = process.env.TERMINAL_API_URL || 'https://new-terminal-production.up.railway.app';
type LinkMode = 'preview' | 'confirm';

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadVerifiedSource(accountId: string) {
  const supabase = createAdminClient();
  const { data: account, error: accountError } = await supabase
    .from('trading_accounts')
    .select('id, trader_id, challenge_id, account_code, balance, available_margin, used_margin, status')
    .eq('id', accountId)
    .single();

  if (accountError || !account) {
    throw Object.assign(new Error('FundedWealth trading account was not found.'), { status: 404 });
  }
  if (!account.trader_id || !account.challenge_id || !account.account_code || account.status !== 'active') {
    throw Object.assign(new Error('The FundedWealth trading account is not eligible for terminal linking.'), { status: 409 });
  }

  const { data: challenge, error: challengeError } = await supabase
    .from('challenge_accounts')
    .select('id, trader_id, type, plan, status, initial_balance, current_balance, peak_balance, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, expires_at')
    .eq('id', account.challenge_id)
    .single();
  if (challengeError || !challenge || challenge.status !== 'active' || challenge.trader_id !== account.trader_id) {
    throw Object.assign(new Error('The active challenge does not match the trading account owner.'), { status: 409 });
  }

  const { data: provisioning, error: provisioningError } = await supabase
    .from('provisioning_logs')
    .select('id, status, source, trader_id, trading_account_id, challenge_account_id')
    .eq('trading_account_id', account.id)
    .eq('challenge_account_id', challenge.id)
    .eq('status', 'completed')
    .limit(2);
  if (provisioningError || !provisioning || provisioning.length !== 1 ||
      provisioning[0].trader_id !== account.trader_id ||
      provisioning[0].trading_account_id !== account.id ||
      provisioning[0].challenge_account_id !== challenge.id) {
    throw Object.assign(new Error('A unique completed provisioning record matching this account was not found.'), { status: 409 });
  }

  const { data: trader, error: traderError } = await supabase
    .from('terminal_traders')
    .select('id, external_id, user_id, email')
    .eq('id', account.trader_id)
    .single();
  if (traderError || !trader) {
    throw Object.assign(new Error('The account owner link is missing from FundedWealth provisioning records.'), { status: 409 });
  }

  const customerId = trader.external_id || trader.user_id;
  if (typeof customerId !== 'string' || !customerId) {
    throw Object.assign(new Error('The FundedWealth trader has no canonical customer mapping.'), { status: 409 });
  }
  const { data: customer, error: customerError } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, account_status, is_active')
    .eq('id', customerId)
    .single();
  if (customerError || !customer || !customer.email ||
      (customer.account_status && customer.account_status !== 'active') ||
      customer.is_active === false ||
      (trader.email && trader.email.toLowerCase() !== customer.email.toLowerCase())) {
    throw Object.assign(new Error('The active FundedWealth customer identity could not be verified.'), { status: 409 });
  }

  const initialBalance = numeric(challenge.initial_balance);
  const currentBalance = numeric(challenge.current_balance);
  const peakBalance = numeric(challenge.peak_balance);
  const profitTargetPct = numeric(challenge.profit_target_pct);
  const dailyLossLimitPct = numeric(challenge.daily_loss_limit_pct);
  const maxDrawdownPct = numeric(challenge.max_drawdown_pct);
  const minTradingDays = numeric(challenge.min_trading_days);
  const tradingBalance = numeric(account.balance);
  const availableMargin = numeric(account.available_margin);
  const usedMargin = numeric(account.used_margin);

  if ([initialBalance, currentBalance, peakBalance, profitTargetPct, dailyLossLimitPct, maxDrawdownPct, minTradingDays, tradingBalance]
    .some((value) => value === null) ||
      initialBalance! <= 0 || minTradingDays! % 1 !== 0 || tradingBalance !== currentBalance) {
    throw Object.assign(new Error('The FundedWealth account balance or challenge rules are incomplete or inconsistent.'), { status: 409 });
  }

  return {
    customer: {
      id: customer.id,
      email: customer.email,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email,
    },
    account: {
      id: account.id,
      traderId: account.trader_id,
      accountCode: account.account_code,
      status: account.status,
      balance: tradingBalance,
      availableMargin,
      usedMargin,
    },
    challenge: {
      id: challenge.id,
      traderId: challenge.trader_id,
      status: challenge.status,
      type: challenge.type,
      plan: challenge.plan,
      initialBalance,
      currentBalance,
      peakBalance,
      profitTargetPct,
      dailyLossLimitPct,
      maxDrawdownPct,
      minTradingDays,
      expiresAt: challenge.expires_at ?? null,
    },
    provisioning: {
      id: provisioning[0].id,
      status: provisioning[0].status,
      source: provisioning[0].source,
      traderId: provisioning[0].trader_id,
      tradingAccountId: provisioning[0].trading_account_id,
      challengeAccountId: provisioning[0].challenge_account_id,
    },
  };
}

async function writeAudit(
  staff: { id: string; roles: string[] },
  request: NextRequest,
  source: Awaited<ReturnType<typeof loadVerifiedSource>>,
  action: string,
  outcome: Record<string, unknown>,
) {
  await auditLogger.log({
    actorId: staff.id,
    actorRole: staff.roles.join(',') || 'Founder',
    action,
    targetEntityType: 'trading_account',
    targetEntityId: source.account.id,
    previousState: null,
    newState: outcome,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    deviceInfo: {
      fingerprint: 'terminal-account-link',
      browser: request.headers.get('user-agent') || 'unknown',
      os: 'Admin OS server',
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    },
  });
}

export async function POST(request: NextRequest) {
  const { staff, error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  let body: { mode?: LinkMode; trading_account_id?: string; confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'A JSON request body is required.' } }, { status: 400 });
  }
  if (body.mode !== 'preview' && body.mode !== 'confirm') {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'mode must be preview or confirm.' } }, { status: 400 });
  }
  if (!body.trading_account_id || !/^[0-9a-f-]{36}$/i.test(body.trading_account_id)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'A valid trading_account_id is required.' } }, { status: 400 });
  }
  const sharedKey = process.env.SSO_API_KEY || process.env.SSO_SHARED_SECRET;
  if (!sharedKey) {
    return NextResponse.json({ error: { code: 'CONFIGURATION_ERROR', message: 'Terminal SSO server authentication is not configured.' } }, { status: 503 });
  }

  try {
    const source = await loadVerifiedSource(body.trading_account_id);
    if (body.mode === 'confirm' && body.confirmation !== `LINK ${source.account.accountCode}`) {
      return NextResponse.json({
        error: { code: 'CONFIRMATION_REQUIRED', message: `Type LINK ${source.account.accountCode} to confirm this exact account.` },
      }, { status: 400 });
    }

    if (body.mode === 'confirm') {
      await writeAudit(staff, request, source, 'terminal_account_link_started', { outcome: 'confirmation_received' });
    }

    const terminalRes = await fetch(`${TERMINAL_API_URL}/api/admin/account-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sso-api-key': sharedKey },
      body: JSON.stringify({
        mode: body.mode,
        source,
        ...(body.mode === 'confirm' ? {
          actor: { id: staff.id, email: staff.email },
          confirmation: body.confirmation,
        } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const terminalData = await terminalRes.json();
    if (!terminalRes.ok) {
      await writeAudit(staff, request, source,
        body.mode === 'preview' ? 'terminal_account_link_previewed' : 'terminal_account_link_completed',
        { outcome: 'rejected', status: terminalRes.status });
      return NextResponse.json(terminalData, { status: terminalRes.status });
    }

    if (body.mode === 'preview' && terminalData.preview) {
      terminalData.preview.provisioning = {
        id: source.provisioning.id,
        source: source.provisioning.source,
        status: source.provisioning.status,
      };
    }

    await writeAudit(staff, request, source,
      body.mode === 'preview' ? 'terminal_account_link_previewed' : 'terminal_account_link_completed',
      body.mode === 'preview'
        ? { outcome: 'preview_ready', preview: terminalData.preview }
        : { outcome: 'linked', result: terminalData.result });
    return NextResponse.json(terminalData);
  } catch (error) {
    const status = Number.isInteger((error as { status?: number })?.status) ? (error as { status: number }).status : 502;
    console.error('[terminal-account-link] Request failed', {
      status,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({
      error: {
        code: status === 502 ? 'TERMINAL_UNREACHABLE' : 'ACCOUNT_LINK_FAILED',
        message: error instanceof Error ? error.message : 'Terminal account linking failed.',
      },
    }, { status });
  }
}
