export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { generateActivationToken } from '@/lib/provisioning/credentials';

/**
 * POST /api/founder/terminal-launch
 *
 * BUG 4 FIX: Launch Terminal with auto-login via SSO token.
 *
 * Flow:
 *   1. Verify founder auth
 *   2. Resolve trading account → get terminal login + email
 *   3. Generate time-limited SSO token (5 min)
 *   4. Return launch_url with token embedded
 *   5. Admin clicks → terminal auto-authenticates, no second login
 *
 * The terminal validates the token by calling back to this admin service
 * at POST /api/founder/terminal-launch/validate (or via shared secret).
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    const body = await request.json();
    const { trading_account_id, email, terminal_login } = body as {
      trading_account_id?: string;
      email?: string;
      terminal_login?: string;
    };

    if (!email && !trading_account_id && !terminal_login) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Provide trading_account_id, email, or terminal_login' } },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Resolve account details
    let resolvedLogin: string | null = terminal_login ?? null;
    let resolvedEmail: string | null = email ?? null;

    if (trading_account_id && !resolvedLogin) {
      const { data: ta } = await supabase
        .from('trading_accounts')
        .select('id, account_code, broker_credentials_encrypted')
        .eq('id', trading_account_id)
        .single();

      if (!ta) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Trading account not found' } },
          { status: 404 },
        );
      }

      resolvedLogin = ta.account_code;

      // Try to get email from broker_credentials_encrypted if not supplied
      if (!resolvedEmail && ta.broker_credentials_encrypted) {
        try {
          const stored = JSON.parse(ta.broker_credentials_encrypted as string);
          if (stored?.user_email) resolvedEmail = stored.user_email;
        } catch { /* ignore parse errors */ }
      }
    }

    if (!resolvedLogin) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Could not resolve terminal login ID' } },
        { status: 400 },
      );
    }

    // Generate SSO token — 5 minute expiry
    const ssoToken = generateActivationToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Store token in DB so terminal can validate it on callback
    // Gracefully handle if sso_tokens table doesn't exist yet
    try {
      const { error: insertErr } = await supabase.from('sso_tokens').insert({
        token: ssoToken,
        terminal_login: resolvedLogin,
        email: resolvedEmail,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        used: false,
      });
      if (insertErr) {
        // Table may not exist — log but don't fail the launch URL generation
        console.warn('[terminal-launch] sso_tokens insert failed (table may not exist):', insertErr.message);
      }
    } catch (ssoErr) {
      console.warn('[terminal-launch] sso_tokens insert error:', ssoErr);
    }

    const terminalBaseUrl =
      process.env.TERMINAL_BASE_URL || 'https://terminal.fundedwealth.com';

    // Build SSO URL — terminal reads these params to auto-authenticate
    const params = new URLSearchParams({
      sso: ssoToken,
      login: resolvedLogin,
      ...(resolvedEmail ? { email: resolvedEmail } : {}),
      expires: expiresAt,
      source: 'admin_emergency_provision',
    });

    const launchUrl = `${terminalBaseUrl}/auth/sso?${params.toString()}`;

    return NextResponse.json({
      success: true,
      launch_url: launchUrl,
      sso_token: ssoToken,
      terminal_login: resolvedLogin,
      expires_at: expiresAt,
      terminal_base_url: terminalBaseUrl,
    });
  } catch (err) {
    console.error('Terminal launch error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate terminal launch URL' } },
      { status: 500 },
    );
  }
}

/**
 * GET /api/founder/terminal-launch/validate?token=<sso_token>
 * Called by Terminal to validate an SSO token on the callback leg.
 * Returns the terminal_login + email if token is valid and unused.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'token is required' } },
        { status: 400 },
      );
    }

    // Verify shared secret from terminal (same TERMINAL_WEBHOOK_SECRET)
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.TERMINAL_WEBHOOK_SECRET;
    if (!expectedSecret || !authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid auth' } },
        { status: 401 },
      );
    }

    const supabase = createAdminClient();

    const { data: ssoRow } = await supabase
      .from('sso_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (!ssoRow) {
      return NextResponse.json(
        { error: { code: 'INVALID_TOKEN', message: 'Token not found' } },
        { status: 404 },
      );
    }

    if (ssoRow.used) {
      return NextResponse.json(
        { error: { code: 'TOKEN_USED', message: 'Token already consumed' } },
        { status: 410 },
      );
    }

    if (new Date(ssoRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' } },
        { status: 410 },
      );
    }

    // Mark token as used (one-time use)
    await supabase
      .from('sso_tokens')
      .update({ used: true })
      .eq('token', token);

    return NextResponse.json({
      valid: true,
      terminal_login: ssoRow.terminal_login,
      email: ssoRow.email,
      expires_at: ssoRow.expires_at,
    });
  } catch (err) {
    console.error('SSO token validate error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Validation failed' } },
      { status: 500 },
    );
  }
}
