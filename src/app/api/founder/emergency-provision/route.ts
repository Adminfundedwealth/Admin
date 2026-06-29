export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { sendEmail } from '@/lib/email/client';
import { z } from 'zod';
import { randomBytes } from 'crypto';

/**
 * POST /api/founder/emergency-provision
 *
 * Emergency Manual Provision — Founder-only.
 * Creates a user (if not already present), challenge_account, trading_account,
 * provisioning_logs, and admin_events entry WITHOUT requiring a historical order.
 *
 * Duplicate protection: If the email already has an active trading account,
 * the request is rejected to prevent duplicates.
 */

const EmergencyProvisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  challenge_type: z.enum(['evaluation', 'express', 'stellar']),
  account_size: z.number().positive('Account size must be positive'),
});

// Generate a trading login ID like "FW-12345678"
function generateLoginId(): string {
  const num = randomBytes(4).readUInt32BE(0) % 99999999;
  return `FW-${String(num).padStart(8, '0')}`;
}

// Generate a secure random password (12 chars, mixed)
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const bytes = randomBytes(12);
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — require Founder access
    const { staff, error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    // 2. Parse and validate body
    const body = await request.json();
    const parsed = EmergencyProvisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { name, email, phone, challenge_type, account_size } = parsed.data;
    const supabase = createAdminClient();

    // 3. Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', email.toLowerCase())
      .single();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      // 4. Duplicate protection — check if this email already has an active trading account
      const { data: activeAccounts } = await supabase
        .from('challenge_accounts')
        .select('id, status, initial_balance, type')
        .eq('trader_id', userId)
        .eq('status', 'active')
        .limit(1);

      if (activeAccounts && activeAccounts.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_ACTIVE_ACCOUNT',
              message: `This email already has an active trading account (${activeAccounts[0].type}, ₹${activeAccounts[0].initial_balance?.toLocaleString()}). Cannot create a duplicate.`,
            },
          },
          { status: 409 }
        );
      }
    } else {
      // 5. Create user
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(' ') || null;

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (userError || !newUser) {
        return NextResponse.json(
          { error: { code: 'USER_CREATE_FAILED', message: `Failed to create user: ${userError?.message}` } },
          { status: 500 }
        );
      }

      userId = newUser.id;
    }

    // 6. Generate credentials
    const loginId = generateLoginId();
    const password = generatePassword();

    // 7. Create challenge_account
    const { data: challengeAccount, error: challengeError } = await supabase
      .from('challenge_accounts')
      .insert({
        trader_id: userId,
        type: challenge_type,
        plan: challenge_type,
        initial_balance: account_size,
        current_balance: account_size,
        peak_balance: account_size,
        profit_target_pct: 10,
        daily_loss_limit_pct: 5,
        max_drawdown_pct: 10,
        min_trading_days: 5,
        max_calendar_days: 30,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (challengeError || !challengeAccount) {
      return NextResponse.json(
        { error: { code: 'PROVISION_FAILED', message: `Failed to create challenge account: ${challengeError?.message}` } },
        { status: 500 }
      );
    }

    // 8. Create trading_account
    const { data: tradingAccount, error: tradingError } = await supabase
      .from('trading_accounts')
      .insert({
        trader_id: userId,
        challenge_id: challengeAccount.id,
        account_code: loginId,
        broker_provider: 'fundedwealth',
        balance: account_size,
        status: 'active',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (tradingError || !tradingAccount) {
      console.error('Failed to create trading account:', tradingError);
      // Non-fatal — challenge account still exists
    }

    // 9. Create provisioning_logs record
    const { error: provError } = await supabase
      .from('provisioning_logs')
      .insert({
        order_id: null,
        trader_id: userId,
        trading_account_id: tradingAccount?.id || null,
        challenge_account_id: challengeAccount.id,
        plan: challenge_type,
        payment_method: 'emergency_manual',
        payment_ref: `EMERGENCY-${Date.now()}`,
        source: 'founder_manual',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

    if (provError) {
      console.error('Failed to create provisioning log:', provError);
      // Non-fatal
    }

    // 10. Send credentials email
    const emailResult = await sendEmail({
      to: email,
      subject: 'Your FundedWealth Trading Account is Ready!',
      html: emergencyCredentialsEmailTemplate({
        userName: name,
        loginId,
        password,
        accountSize: account_size,
        challengeType: challenge_type,
      }),
    });

    // 11. Write audit log (admin_events)
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
    try {
      await auditLogger.log({
        actorId: staff!.id,
        actorRole: 'Founder',
        action: 'provision.emergency_manual',
        targetEntityType: 'user',
        targetEntityId: userId,
        newState: {
          email,
          name,
          challenge_account_id: challengeAccount.id,
          trading_account_id: tradingAccount?.id || null,
          login_id: loginId,
          account_size,
          challenge_type,
          source: 'founder_manual',
        },
        ipAddress: ipAddress.split(',')[0].trim(),
        deviceInfo: {
          fingerprint: 'founder-emergency-provision',
          browser: request.headers.get('user-agent') || 'unknown',
          os: 'server',
          ipAddress: ipAddress.split(',')[0].trim(),
        },
        metadata: {
          phone: phone || null,
          email_sent: emailResult.success,
          email_message_id: emailResult.messageId || null,
          user_existed: !!existingUser,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    // 12. Return success with credentials
    return NextResponse.json({
      success: true,
      data: {
        user_id: userId,
        user_email: email,
        user_name: name,
        challenge_account_id: challengeAccount.id,
        trading_account_id: tradingAccount?.id || null,
        login_id: loginId,
        password,
        account_size,
        challenge_type,
        email_sent: emailResult.success,
        user_created: !existingUser,
        provisioned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Emergency provision error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Emergency provisioning failed unexpectedly' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Email Template
// ---------------------------------------------------------------------------

function emergencyCredentialsEmailTemplate(params: {
  userName: string;
  loginId: string;
  password: string;
  accountSize: number;
  challengeType: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your Trading Account is Ready</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;line-height:1.6;">
      <img src="https://fundedwealth.com/logo.png" alt="FundedWealth" style="height:32px;margin-bottom:24px;" />
      
      <h2 style="margin:0 0 16px;color:#16a34a;">🎉 Your Trading Account is Ready!</h2>
      
      <p>Hi ${params.userName},</p>
      
      <p>Great news! Your FundedWealth trading account has been provisioned and is ready to use.</p>
      
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
        <h3 style="margin:0 0 12px;font-size:14px;color:#166534;">Account Details</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Login ID:</td><td style="padding:4px 0;font-weight:700;font-size:14px;">${params.loginId}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Password:</td><td style="padding:4px 0;font-weight:700;font-size:14px;font-family:monospace;">${params.password}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Account Size:</td><td style="padding:4px 0;font-weight:600;font-size:14px;">₹${params.accountSize.toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Challenge:</td><td style="padding:4px 0;font-size:14px;">${params.challengeType}</td></tr>
        </table>
      </div>
      
      <p style="font-size:13px;color:#dc2626;font-weight:600;">⚠️ Please change your password after first login.</p>
      
      <a href="https://terminal.fundedwealth.com" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;margin-top:16px;">Login to Trading Terminal</a>
      
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;" />
      <p style="font-size:12px;color:#71717a;">
        This is an automated email from FundedWealth. Do not reply directly.<br/>
        If you need help, contact support@fundedwealth.com
      </p>
    </div>
  </div>
</body>
</html>`;
}
