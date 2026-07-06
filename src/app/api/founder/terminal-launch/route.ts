export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';

/**
 * POST /api/founder/terminal-launch
 *
 * Generates a terminal SSO launch URL for a trading account.
 *
 * Flow:
 *   1. Founder auth
 *   2. Resolve trading_account → get accountId, traderId, email, accountCode
 *   3. Call terminal POST /auth/sso/generate with x-sso-api-key
 *      Terminal signs a JWT with SSO_SHARED_SECRET, returns { token, launchUrl }
 *   4. Return launchUrl — clicking it does GET /auth/sso?token=<jwt>
 *      Terminal verifies JWT, sets fw_session cookie, redirects to /
 *      Result: user is inside trading terminal, no second login
 *
 * Env required:
 *   TERMINAL_API_URL  — e.g. https://terminal.fundedwealth.com
 *   SSO_API_KEY       — shared secret for x-sso-api-key header (same value on terminal)
 */
export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    const body = await request.json();
    const { trading_account_id, challenge_account_id, email, terminal_login } = body as {
      trading_account_id?: string;
      challenge_account_id?: string;
      email?: string;
      terminal_login?: string;
    };

    if (!trading_account_id && !challenge_account_id && !terminal_login) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Provide trading_account_id, challenge_account_id, or terminal_login' } },
        { status: 400 },
      );
    }

    const TERMINAL_API_URL = (process.env.TERMINAL_API_URL || 'https://terminal.fundedwealth.com').replace(/\/$/, '');
    const SSO_API_KEY = process.env.SSO_API_KEY || '';

    if (!SSO_API_KEY) {
      return NextResponse.json(
        { error: { code: 'CONFIGURATION_ERROR', message: 'SSO_API_KEY not configured. Add it to environment variables.' } },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();

    // ── 2. Resolve account details ────────────────────────────────────────────
    let resolvedTradingAccountId: string | null = trading_account_id ?? null;
    let resolvedChallengeAccountId: string | null = challenge_account_id ?? null;
    let resolvedEmail: string | null = email ?? null;
    let resolvedAccountCode: string | null = terminal_login ?? null;
    let resolvedTraderId: string | null = null;

    // Look up from trading_accounts if id supplied
    if (resolvedTradingAccountId) {
      const { data: ta } = await supabase
        .from('trading_accounts')
        .select('id, trader_id, challenge_id, account_code, broker_credentials_encrypted')
        .eq('id', resolvedTradingAccountId)
        .single();

      if (!ta) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Trading account not found' } },
          { status: 404 },
        );
      }

      resolvedAccountCode = resolvedAccountCode ?? ta.account_code;
      resolvedTraderId = ta.trader_id;
      resolvedChallengeAccountId = resolvedChallengeAccountId ?? ta.challenge_id;

      // Try to recover email from broker_credentials_encrypted
      if (!resolvedEmail && ta.broker_credentials_encrypted) {
        try {
          const stored = JSON.parse(ta.broker_credentials_encrypted as string);
          resolvedEmail = stored?.user_email ?? null;
        } catch { /* ignore */ }
      }
    }

    // Look up trader email from terminal_traders if not resolved yet
    if (!resolvedEmail && resolvedTraderId) {
      const { data: trader } = await supabase
        .from('terminal_traders')
        .select('email')
        .eq('id', resolvedTraderId)
        .single();
      resolvedEmail = trader?.email ?? null;
    }

    if (!resolvedTradingAccountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Could not resolve trading account ID' } },
        { status: 400 },
      );
    }

    // ── 3. Call terminal /auth/sso/generate ───────────────────────────────────
    // Terminal signs a JWT with SSO_SHARED_SECRET, returns { token, launchUrl }
    const terminalPayload = {
      fwUserId: resolvedTraderId ?? resolvedTradingAccountId,
      accountId: resolvedTradingAccountId,
      challengeId: resolvedChallengeAccountId ?? null,
      email: resolvedEmail ?? null,
      name: null,
      accountCode: resolvedAccountCode ?? null,
    };

    let launchUrl: string;
    let ssoToken: string;

    try {
      const terminalRes = await fetch(`${TERMINAL_API_URL}/auth/sso/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sso-api-key': SSO_API_KEY,
        },
        body: JSON.stringify(terminalPayload),
        signal: AbortSignal.timeout(10000),
      });

      if (!terminalRes.ok) {
        const errBody = await terminalRes.text().catch(() => '');
        console.error(`[terminal-launch] Terminal SSO generate failed ${terminalRes.status}: ${errBody}`);
        return NextResponse.json(
          {
            error: {
              code: 'SSO_GENERATE_FAILED',
              message: `Terminal rejected SSO token generation (${terminalRes.status}): ${errBody.slice(0, 200)}`,
            },
          },
          { status: 502 },
        );
      }

      const terminalData = await terminalRes.json() as {
        success?: boolean;
        token?: string;
        launchUrl?: string;
        url?: string;
        expiresIn?: number;
      };

      if (!terminalData.success || (!terminalData.token && !terminalData.launchUrl)) {
        return NextResponse.json(
          {
            error: {
              code: 'SSO_GENERATE_FAILED',
              message: `Terminal SSO generate returned unexpected response: ${JSON.stringify(terminalData).slice(0, 200)}`,
            },
          },
          { status: 502 },
        );
      }

      // Terminal may return launchUrl directly, or just a token we must embed
      launchUrl = terminalData.launchUrl ||
        terminalData.url ||
        `${TERMINAL_API_URL}/auth/sso?token=${encodeURIComponent(terminalData.token!)}`;
      ssoToken = terminalData.token ?? '';

    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error('[terminal-launch] fetch to terminal failed:', msg);
      return NextResponse.json(
        {
          error: {
            code: 'TERMINAL_UNREACHABLE',
            message: `Could not reach terminal at ${TERMINAL_API_URL}: ${msg}`,
          },
        },
        { status: 502 },
      );
    }

    // ── 4. Return launch URL ──────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      launch_url: launchUrl,
      sso_token: ssoToken,
      terminal_login: resolvedAccountCode,
      terminal_url: TERMINAL_API_URL,
      expires_in: 60,
    });

  } catch (err) {
    console.error('[terminal-launch] Unhandled error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate terminal launch URL' } },
      { status: 500 },
    );
  }
}
