export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOTP, Secret } from 'otpauth';
import { encrypt } from '@/lib/security/encryption';

/**
 * POST /api/auth/2fa/setup
 * Generate a new TOTP secret for first-time 2FA setup.
 * 
 * SECURITY: Requires a valid setup token from the login flow.
 * The staffId is NOT accepted directly from the client.
 * Instead, a setupToken is generated during login when 2FA is not yet enabled.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { setupToken } = body;

    if (!setupToken) {
      return NextResponse.json(
        { error: { code: 'MISSING_TOKEN', message: 'Setup token is required. Please log in again.' } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate the setup token (same pattern as 2FA challenge tokens)
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

    // Check expiry (5 minutes for setup)
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

    const staffId = setupSession.staff_id;

    // Verify the staff member exists and doesn't already have 2FA
    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('id, email, name, totp_enabled, totp_secret')
      .eq('id', staffId)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: { code: 'STAFF_NOT_FOUND', message: 'Staff member not found' } },
        { status: 404 }
      );
    }

    if (staff.totp_enabled) {
      return NextResponse.json(
        { error: { code: 'ALREADY_ENABLED', message: '2FA is already enabled for this account' } },
        { status: 400 }
      );
    }

    // Generate a new TOTP secret
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'FundedWealth Admin',
      label: staff.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    // Generate the otpauth:// URI (for QR code generation on frontend)
    const qrCodeUrl = totp.toString();
    const secretBase32 = secret.base32;

    // Store the secret encrypted (not enabled yet — will be enabled after verification)
    const encryptedSecret = encrypt(secretBase32);
    await supabase
      .from('staff_members')
      .update({ totp_secret: encryptedSecret })
      .eq('id', staffId);

    return NextResponse.json({
      qrCodeUrl,
      secret: secretBase32,
      setupToken, // Return for use in verify step
    });
  } catch (err) {
    console.error('2FA setup error:', err instanceof Error ? err.message : 'Unknown');
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to initialize 2FA setup' } },
      { status: 500 }
    );
  }
}
