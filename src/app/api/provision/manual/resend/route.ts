export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { sendEmail } from '@/lib/email/client';

/**
 * POST /api/provision/manual/resend
 * Resend credentials email for an already-provisioned order.
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    const body = await request.json();
    const { user_email, user_name, login_id, password, account_size, plan, challenge_type } = body;

    if (!user_email || !login_id || !password) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: user_email, login_id, password' } },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      to: user_email,
      subject: 'Your FundedWealth Trading Account is Ready!',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your Trading Account is Ready</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;line-height:1.6;">
      <img src="https://fundedwealth.com/logo.png" alt="FundedWealth" style="height:32px;margin-bottom:24px;" />
      <h2 style="margin:0 0 16px;color:#16a34a;">🎉 Your Trading Account is Ready!</h2>
      <p>Hi ${user_name || 'Trader'},</p>
      <p>Great news! Your FundedWealth trading account has been provisioned and is ready to use.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
        <h3 style="margin:0 0 12px;font-size:14px;color:#166534;">Account Details</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Login ID:</td><td style="padding:4px 0;font-weight:700;font-size:14px;">${login_id}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Password:</td><td style="padding:4px 0;font-weight:700;font-size:14px;font-family:monospace;">${password}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Account Size:</td><td style="padding:4px 0;font-weight:600;font-size:14px;">₹${(account_size || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Plan:</td><td style="padding:4px 0;font-size:14px;">${plan || ''} (${challenge_type || ''})</td></tr>
        </table>
      </div>
      <p style="font-size:13px;color:#dc2626;font-weight:600;">⚠️ Please change your password after first login.</p>
      <a href="https://terminal.fundedwealth.com" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;margin-top:16px;">Login to Trading Terminal</a>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;" />
      <p style="font-size:12px;color:#71717a;">This is an automated email from FundedWealth. Do not reply directly.<br/>If you need help, contact support@fundedwealth.com</p>
    </div>
  </div>
</body>
</html>`,
    });

    return NextResponse.json({ success: result.success, messageId: result.messageId, error: result.error });
  } catch (err) {
    console.error('Resend email error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to resend email' } },
      { status: 500 }
    );
  }
}
