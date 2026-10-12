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
      const terminalRes = await fetch(`${TERMINAL_SSO_API_URL}/auth/sso/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sso-api-key': SSO_API_KEY,
        },
        body: JSON.stringify({ accountId: trading_account_id }),
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
