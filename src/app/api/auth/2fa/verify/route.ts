export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationEngine } from '@/lib/notifications/engine';
import { z } from 'zod';
import { decrypt, isEncrypted } from '@/lib/security/encryption';

const verifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
  challengeToken: z.string().uuid('Invalid challenge token'),
});

/**
 * POST /api/auth/2fa/verify
 * Verify a TOTP code after credential authentication.
 * 
 * Implements:
 * - TOTP validation (60s window)
 * - 3 consecutive failures → 15min lock + Founder notification
 * - Session creation on success
 * - Login history recording
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } },
        { status: 400 }
      );
    }

    const { code, challengeToken } = parsed.data;
    const supabase = createAdminClient();

    // Validate the challenge token
    const { data: challengeSession, error: challengeError } = await supabase
      .from('staff_sessions')
      .select('*')
      .eq('token_hash', `2fa_challenge:${challengeToken}`)
      .is('invalidated_at', null)
      .single();

    if (challengeError || !challengeSession) {
      return NextResponse.json(
        { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired challenge token. Please log in again.' } },
        { status: 401 }
      );
    }

    // Check if challenge has expired (60s)
    const challengeExpiry = new Date(challengeSession.expires_at);
    if (challengeExpiry < new Date()) {
      // Clean up expired challenge
      await supabase
        .from('staff_sessions')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('id', challengeSession.id);

      return NextResponse.json(
        { error: { code: 'TOKEN_EXPIRED', message: 'Verification window expired. Please log in again.' } },
        { status: 401 }
      );
    }

    // Get staff member with TOTP secret
    const { data: staff } = await supabase
      .from('staff_members')
      .select('*')
      .eq('id', challengeSession.staff_id)
      .single();

    if (!staff || !staff.totp_secret) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: '2FA not configured' } },
        { status: 500 }
      );
    }

    // Decrypt TOTP secret if encrypted
    let totpSecret = staff.totp_secret;
    if (isEncrypted(totpSecret)) {
      totpSecret = decrypt(totpSecret);
    }

    // Verify TOTP code
    const { TOTP } = await import('otpauth');
    const totp = new TOTP({
      secret: totpSecret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    // Validate with ±1 period window (60s total)
    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      // Invalid code — track attempts
      // For simplicity, we track 2FA attempts via failed_login_attempts
      const newAttempts = (staff.failed_login_attempts ?? 0) + 1;

      if (newAttempts >= 3) {
        // Lock for 15 minutes
        await supabase.from('staff_members').update({
          status: 'locked',
          locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          failed_login_attempts: newAttempts,
        }).eq('id', staff.id);

        // Invalidate the challenge
        await supabase
          .from('staff_sessions')
          .update({ invalidated_at: new Date().toISOString() })
          .eq('id', challengeSession.id);

        // Notify Founders of 2FA lockout
        notificationEngine.broadcast({
          permission: 'staff.manage',
          priority: 'high',
          title: 'Staff Account Locked - 2FA Failures',
          message: `Staff account ${staff.email} locked after 3 failed 2FA attempts from IP ${getClientIP(request)}`,
          eventSource: 'auth.2fa_lockout',
          linkTo: '/staff',
        }).catch(err => console.error('Failed to notify founders of 2FA lockout:', err));

        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOCKED', message: 'Account locked for 15 minutes due to failed 2FA attempts.' } },
          { status: 403 }
        );
      }

      await supabase.from('staff_members')
        .update({ failed_login_attempts: newAttempts })
        .eq('id', staff.id);

      return NextResponse.json(
        { error: { code: 'INVALID_CODE', message: 'Invalid verification code' } },
        { status: 401 }
      );
    }

    // 2FA verified successfully — clean up challenge and create real session
    await supabase
      .from('staff_sessions')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('id', challengeSession.id);

    // Reset failed attempts
    await supabase.from('staff_members')
      .update({ failed_login_attempts: 0, locked_until: null })
      .eq('id', staff.id);

    // Create real session using SessionManager
    const { sessionManager } = await import('@/lib/session/manager');
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || 'unknown';
    const { token } = await sessionManager.create({
      staffId: staff.id,
      deviceInfo: {
        fingerprint: deviceFingerprint,
        browser: request.headers.get('user-agent')?.split('/')[0] || 'unknown',
        os: 'unknown',
        ipAddress: getClientIP(request),
      },
    });

    // Record login history
    const isNewDevice = await checkNewDevice(supabase, staff.id, deviceFingerprint);
    await supabase.from('login_history').insert({
      staff_id: staff.id,
      ip_address: getClientIP(request),
      device_fingerprint: deviceFingerprint,
      browser: request.headers.get('user-agent') || null,
      os: null,
      success: true,
      is_new_device: isNewDevice,
    });

    // Set session cookie and return success
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
    console.error('2FA verify error:', err instanceof Error ? err.message : 'Unknown');
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}

async function checkNewDevice(supabase: ReturnType<typeof createAdminClient>, staffId: string, fingerprint: string): Promise<boolean> {
  const { data } = await supabase
    .from('staff_devices')
    .select('id')
    .eq('staff_id', staffId)
    .eq('device_fingerprint', fingerprint)
    .single();
  return !data;
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
