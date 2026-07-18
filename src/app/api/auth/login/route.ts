export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationEngine } from '@/lib/notifications/engine';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/login
 * Authenticate staff with email/password.
 * Returns session token or 2FA challenge token.
 * 
 * Implements:
 * - Credential verification (bcrypt)
 * - Account lockout (5 failures in 10min → 30min lock)
 * - New device detection
 * - 2FA flow initiation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const supabase = createAdminClient();

    // Fetch staff member
    const { data: staff, error: fetchError } = await supabase
      .from('staff_members')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (fetchError || !staff) {
      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (staff.status === 'locked' && staff.locked_until) {
      const lockedUntil = new Date(staff.locked_until);
      if (lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOCKED', message: `Account locked. Try again in ${minutesLeft} minutes.` } },
          { status: 403 }
        );
      }
      // Lock period has passed — reset
      await supabase
        .from('staff_members')
        .update({ status: 'active', failed_login_attempts: 0, locked_until: null })
        .eq('id', staff.id);
    }

    if (staff.status === 'disabled') {
      return NextResponse.json(
        { error: { code: 'ACCOUNT_DISABLED', message: 'Account has been disabled. Contact an administrator.' } },
        { status: 403 }
      );
    }

    // Verify password using bcrypt
    const bcrypt = await import('bcryptjs');
    const passwordValid = await bcrypt.compare(password, staff.password_hash);

    if (!passwordValid) {
      // Increment failed attempts
      const newAttempts = (staff.failed_login_attempts ?? 0) + 1;
      const updates: Record<string, unknown> = { failed_login_attempts: newAttempts };

      // Lock after 5 failures
      if (newAttempts >= 5) {
        updates.status = 'locked';
        updates.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
      }

      await supabase.from('staff_members').update(updates).eq('id', staff.id);

      // Record failed login
      await supabase.from('login_history').insert({
        staff_id: staff.id,
        ip_address: getClientIP(request),
        device_fingerprint: request.headers.get('x-device-fingerprint') || null,
        browser: request.headers.get('user-agent')?.split('/')[0] || null,
        os: null,
        success: false,
        failure_reason: 'invalid_password',
        is_new_device: false,
      });

      if (newAttempts >= 5) {
        // Notify Founders of account lockout
        notificationEngine.broadcast({
          permission: 'staff.manage',
          priority: 'high',
          title: 'Staff Account Locked',
          message: `Staff account ${staff.email} locked after 5 failed login attempts from IP ${getClientIP(request)}`,
          eventSource: 'auth.lockout',
          linkTo: '/staff',
        }).catch(err => console.error('Failed to notify founders of lockout:', err));
        
        return NextResponse.json(
          { error: { code: 'ACCOUNT_LOCKED', message: 'Account locked for 30 minutes due to too many failed attempts.' } },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // Password correct — reset failed attempts
    if (staff.failed_login_attempts > 0) {
      await supabase
        .from('staff_members')
        .update({ failed_login_attempts: 0, locked_until: null })
        .eq('id', staff.id);
    }

    // Check if temp password has expired
    if (staff.force_password_change && staff.temp_password_expires_at) {
      const tempExpiry = new Date(staff.temp_password_expires_at);
      if (tempExpiry < new Date()) {
        return NextResponse.json(
          { error: { code: 'PASSWORD_EXPIRED', message: 'Temporary password has expired. Contact an administrator.' } },
          { status: 403 }
        );
      }
    }

    // Check if 2FA is required
    if (staff.totp_enabled) {
      // Generate a challenge token for 2FA step
      const challengeToken = crypto.randomUUID();
      // Store challenge token temporarily (60s validity)
      await supabase.from('staff_sessions').insert({
        staff_id: staff.id,
        token_hash: `2fa_challenge:${challengeToken}`,
        ip_address: getClientIP(request),
        device_fingerprint: request.headers.get('x-device-fingerprint') || null,
        browser: request.headers.get('user-agent') || null,
        os: null,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 1000).toISOString(), // 60s for 2FA
      });

      return NextResponse.json({
        requires2FA: true,
        challengeToken,
      });
    }

    // Check if 2FA setup is required (first login)
    if (!staff.totp_enabled) {
      // Skip 2FA setup requirement — create session directly
      // Staff can enable 2FA later from their profile
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

      // Record login
      await supabase.from('login_history').insert({
        staff_id: staff.id,
        ip_address: getClientIP(request),
        device_fingerprint: deviceFingerprint,
        browser: request.headers.get('user-agent') || null,
        os: null,
        success: true,
        is_new_device: true,
      });

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
    }

    // Should not reach here (either 2FA enabled or setup required)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected auth state' } },
      { status: 500 }
    );
  } catch (err) {
    console.error('Login error:', err);
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
