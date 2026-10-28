export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';

const TERMINAL_SSO_API_URL = process.env.NODE_ENV === 'production'
  ? 'https://new-terminal-production.up.railway.app'
  : process.env.TERMINAL_SSO_API_URL || 'https://new-terminal-production.up.railway.app';
const TERMINAL_PUBLIC_URL = 'https://charts.fundedwealth.com';

/**
 * POST /api/founder/terminal-launch
 *
 * Returns a short-lived handoff for a POST to the chart-domain callback.
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    const body = await request.json();
    const { trading_account_id } = body as {
      trading_account_id?: string;
    };

    if (typeof trading_account_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(trading_account_id)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'A valid trading_account_id is required.' } },
        { status: 400 },
      );
    }

    const SSO_API_KEY = process.env.SSO_API_KEY || process.env.SSO_SHARED_SECRET || '';

    if (!SSO_API_KEY) {
      return NextResponse.json(
        { error: { code: 'CONFIGURATION_ERROR', message: 'Terminal SSO is not configured.' } },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();
    try {
      const { data: account, error: accountError } = await supabase
        .from('trading_accounts')
        .select('id, trader_id, challenge_id, account_code, status, balance, available_margin, used_margin')
        .eq('id', trading_account_id)
        .maybeSingle();

      if (accountError) {
        console.error('[terminal-launch] Failed to load trading account', { message: accountError.message });
        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOOKUP_FAILED', message: 'Unable to verify this trading account.' } },
          { status: 500 },
        );
      }
      if (!account) {
        return NextResponse.json(
          { error: { code: 'ACCOUNT_NOT_FOUND', message: 'Trading account not found.' } },
          { status: 404 },
        );
      }

      const [challengeResult, traderResult] = await Promise.all([
        supabase
          .from('challenge_accounts')
          .select('id, trader_id, type, plan, status, initial_balance, current_balance, peak_balance, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, expires_at')
          .eq('id', account.challenge_id)
          .maybeSingle(),
        supabase
          .from('terminal_traders')
          .select('id, external_id, display_name')
          .eq('id', account.trader_id)
          .maybeSingle(),
      ]);

      if (challengeResult.error || traderResult.error) {
        console.error('[terminal-launch] Failed to load account ownership records', {
          challengeError: challengeResult.error?.message,
          traderError: traderResult.error?.message,
        });
        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOOKUP_FAILED', message: 'Unable to verify this trading account.' } },
          { status: 500 },
        );
      }

      const challenge = challengeResult.data;
      const trader = traderResult.data;
      if (!challenge || !trader || challenge.trader_id !== account.trader_id || !trader.external_id) {
        return NextResponse.json(
          { error: { code: 'ACCOUNT_OWNERSHIP_INVALID', message: 'The account ownership records could not be verified.' } },
          { status: 409 },
        );
      }

      const { data: customer, error: customerError } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('id', trader.external_id)
        .maybeSingle();

      if (customerError) {
        console.error('[terminal-launch] Failed to load account owner', { message: customerError.message });
        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOOKUP_FAILED', message: 'Unable to verify this trading account.' } },
          { status: 500 },
        );
      }
      if (!customer?.email) {
        return NextResponse.json(
          { error: { code: 'ACCOUNT_OWNERSHIP_INVALID', message: 'The account owner could not be verified.' } },
          { status: 409 },
        );
      }

      if (account.status !== 'active' || challenge.status !== 'active') {
        return NextResponse.json(
          { error: { code: 'ACCOUNT_NOT_ELIGIBLE', message: 'Only active trading accounts can be launched.' } },
          { status: 409 },
        );
      }

      const { data: provisioning, error: provisioningError } = await supabase
        .from('provisioning_logs')
        .select('id, status')
        .eq('trading_account_id', account.id)
        .eq('challenge_account_id', challenge.id)
        .eq('trader_id', trader.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (provisioningError) {
        console.error('[terminal-launch] Failed to verify provisioning record', { message: provisioningError.message });
        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOOKUP_FAILED', message: 'Unable to verify this trading account.' } },
          { status: 500 },
        );
      }

      const accountLinkSource = {
        customer: {
          id: String(customer.id),
          email: String(customer.email).trim().toLowerCase(),
          name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || trader.display_name || undefined,
        },
        account: {
          id: String(account.id),
          traderId: String(account.trader_id),
          accountCode: String(account.account_code),
          status: String(account.status),
          balance: Number(account.balance),
          availableMargin: account.available_margin == null ? null : Number(account.available_margin),
          usedMargin: account.used_margin == null ? null : Number(account.used_margin),
        },
        challenge: {
          id: String(challenge.id),
          traderId: String(challenge.trader_id),
          status: String(challenge.status),
          type: String(challenge.type),
          plan: String(challenge.plan),
          initialBalance: Number(challenge.initial_balance),
          currentBalance: Number(challenge.current_balance),
          peakBalance: Number(challenge.peak_balance),
          profitTargetPct: Number(challenge.profit_target_pct),
          dailyLossLimitPct: Number(challenge.daily_loss_limit_pct),
          maxDrawdownPct: Number(challenge.max_drawdown_pct),
          minTradingDays: Number(challenge.min_trading_days),
          expiresAt: challenge.expires_at ?? null,
        },
        provisioning: {
          status: provisioning?.status ?? 'ownership_verified',
          tradingAccountId: String(account.id),
          challengeAccountId: String(challenge.id),
          traderId: String(trader.id),
        },
      };

      const mappingRes = await fetch(`${TERMINAL_SSO_API_URL}/api/admin/account-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sso-api-key': SSO_API_KEY,
        },
        body: JSON.stringify({ mode: 'ensure', source: accountLinkSource }),
        signal: AbortSignal.timeout(25000),
      });
      const mappingData = await mappingRes.json().catch(() => null) as {
        success?: boolean;
        result?: { accountId?: string };
        error?: string;
      } | null;

      if (!mappingRes.ok || !mappingData?.success || !mappingData.result?.accountId) {
        console.error('[terminal-launch] Terminal account mapping failed', {
          status: mappingRes.status,
          error: mappingData?.error ?? null,
        });
        return NextResponse.json(
          {
            error: {
              code: 'ACCOUNT_LINK_FAILED',
              message: mappingData?.error ?? 'Unable to prepare this account in the terminal.',
            },
          },
          { status: mappingRes.status === 409 ? 409 : 502 },
        );
      }

      const terminalRes = await fetch(`${TERMINAL_SSO_API_URL}/auth/sso/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sso-api-key': SSO_API_KEY,
        },
        body: JSON.stringify({ accountId: account.id }),
        signal: AbortSignal.timeout(10000),
      });

      if (!terminalRes.ok) {
        console.error('[terminal-launch] Terminal SSO generation rejected', { status: terminalRes.status });
        return NextResponse.json(
          {
            error: {
              code: 'SSO_GENERATE_FAILED',
              message: 'Terminal SSO is temporarily unavailable.',
            },
          },
          { status: 502 },
        );
      }

      const terminalData = await terminalRes.json() as {
        success?: boolean;
        token?: string;
        expiresIn?: number;
      };

      if (!terminalData.success || !terminalData.token) {
        return NextResponse.json(
          {
            error: {
              code: 'SSO_GENERATE_FAILED',
              message: 'Terminal SSO returned an invalid handoff.',
            },
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        success: true,
        sso_token: terminalData.token,
        terminal_url: TERMINAL_PUBLIC_URL,
        expires_in: terminalData.expiresIn ?? 60,
      });
    } catch {
      console.error('[terminal-launch] Terminal SSO service unavailable');
      return NextResponse.json(
        {
          error: {
            code: 'TERMINAL_UNREACHABLE',
            message: 'Terminal SSO is temporarily unavailable.',
          },
        },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error('[terminal-launch] Request failed', {
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate terminal launch URL' } },
      { status: 500 },
    );
  }
}
