export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOTP } from 'otpauth';
import { sessionManager } from '@/lib/session/manager';
import { encrypt, decrypt, isEncrypted } from '@/lib/security/encryption';

/**
 * POST /api/auth/2fa/setup/verify
 * Verify the first TOTP code during setup, enable 2FA, and create a session.
 * This completes the first-login flow.
 * 
 * SECURITY: Requires a valid setupToken from the login flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, secret, setupToken } = body;

    if (!code || !secret || !setupToken) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Code, secret, and setupToken are required' } },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Code must be 6 digits' } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate the setup token
    const { data: setupSession, error: sessionError } = await supabase
      .from('staff_sessions')
      .select('*')
      .eq('token_hash', `2fa_setup:${setupToken}`)
      .is('invalidated_at', null)
      .single();

    if (sessionError || !setupSession) {
      return NextResponse.json(
        { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired setup token. Please log in again.' } },
        { status: 401 }
      );
    }

    // Check expiry
    const setupExpiry = new Date(setupSession.expires_at);
    if (setupExpiry < new Date()) {
      await supabase
        .from('staff_sessions')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('id', setupSession.id);

      return NextResponse.json(
        { error: { code: 'TOKEN_EXPIRED', message: 'Setup window expired. Please log in again.' } },
        { status: 401 }
      );
    }

    const resolvedStaffId = setupSession.staff_id;

    // Get the staff member
    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('id, email, name, totp_secret, totp_enabled')
      .eq('id', resolvedStaffId)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: { code: 'STAFF_NOT_FOUND', message: 'Staff member not found' } },
        { status: 404 }
      );
    }

    if (staff.totp_enabled) {
      return NextResponse.json(
        { error: { code: 'ALREADY_ENABLED', message: '2FA is already enabled' } },
        { status: 400 }
      );
    }

    // Verify the TOTP code using the plaintext secret from the client
    const totp = new TOTP({
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      return NextResponse.json(
        { error: { code: 'INVALID_CODE', message: 'Invalid verification code. Please try again.' } },
        { status: 401 }
      );
    }

    // Enable 2FA — store the secret encrypted
    const encryptedSecret = encrypt(secret);
    await supabase
      .from('staff_members')
      .update({ totp_enabled: true, totp_secret: encryptedSecret })
      .eq('id', staff.id);

    // Invalidate the setup token
    await supabase
      .from('staff_sessions')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('id', setupSession.id);

    // Create session
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || 'setup-device';
    const { token } = await sessionManager.create({
      staffId: staff.id,
      deviceInfo: {
        fingerprint: deviceFingerprint,
        browser: request.headers.get('user-agent')?.split('/')[0] || 'unknown',
        os: 'unknown',
        ipAddress: getClientIP(request),
      },
    });

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      staffId: staff.id,
      name: staff.name,
    });

    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (err) {
    console.error('2FA setup verify error:', err instanceof Error ? err.message : 'Unknown');
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
