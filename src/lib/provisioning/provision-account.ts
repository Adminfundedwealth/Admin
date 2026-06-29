import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/client';
import { getProductConfig, type ChallengeProductConfig } from '@/config/challenge-products';
import { randomBytes } from 'crypto';

/**
 * Shared Provisioning Pipeline — SINGLE provisioning logic.
 *
 * This function is the ONE source of truth for creating a provisioned account.
 * It is called by:
 *   - POST /api/provision/manual (order-based manual provision)
 *   - POST /api/founder/emergency-provision (emergency, no order required)
 *
 * The output is IDENTICAL regardless of entry point — same challenge_accounts fields,
 * same trading_accounts fields, same risk profile, drawdown rules, profit target,
 * leverage, payout schedule, account phase, platform, and terminal permissions.
 */

export interface ProvisionInput {
  /** User ID (must already exist in users table) */
  userId: string;
  /** User email for sending credentials */
  userEmail: string;
  /** User display name */
  userName: string;
  /** Challenge type slug (flash, instant, 1-step, 2-step) */
  challengeType: string;
  /** Account size in INR */
  accountSize: number;
  /** Source identifier for provisioning_logs */
  source: 'admin_manual' | 'founder_manual';
  /** Optional order_id (null for emergency provision) */
  orderId: string | null;
  /** Optional payment method */
  paymentMethod: string;
  /** Optional payment reference */
  paymentRef: string;
}

export interface ProvisionResult {
  success: boolean;
  challengeAccountId: string | null;
  tradingAccountId: string | null;
  loginId: string;
  password: string;
  emailSent: boolean;
  product: ChallengeProductConfig;
  error?: string;
}

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

/**
 * Provision a trading account using the production pipeline.
 * Creates challenge_account, trading_account, provisioning_logs — all with
 * correct parameters from the challenge products configuration.
 */
export async function provisionAccount(input: ProvisionInput): Promise<ProvisionResult> {
  const product = getProductConfig(input.challengeType);
  if (!product) {
    return {
      success: false,
      challengeAccountId: null,
      tradingAccountId: null,
      loginId: '',
      password: '',
      emailSent: false,
      product: null as any,
      error: `Invalid challenge type: ${input.challengeType}. Valid types: flash, instant, 1-step, 2-step`,
    };
  }

  // Validate account size is valid for this product
  if (!product.accountSizes.includes(input.accountSize)) {
    return {
      success: false,
      challengeAccountId: null,
      tradingAccountId: null,
      loginId: '',
      password: '',
      emailSent: false,
      product,
      error: `Account size ₹${input.accountSize.toLocaleString()} is not valid for ${product.displayName}. Valid sizes: ${product.accountSizes.map(s => '₹' + s.toLocaleString()).join(', ')}`,
    };
  }

  const supabase = createAdminClient();
  const loginId = generateLoginId();
  const password = generatePassword();
  const now = new Date().toISOString();

  // Calculate expiry date based on max_trading_days
  const expiresAt = product.maxTradingDays
    ? new Date(Date.now() + product.maxTradingDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // 1. Create challenge_account with EXACT production parameters
  const { data: challengeAccount, error: challengeError } = await supabase
    .from('challenge_accounts')
    .insert({
      trader_id: input.userId,
      order_id: input.orderId,
      type: product.slug,
      plan: product.slug,
      challenge_type: product.slug,
      phase: product.startingPhase,
      initial_balance: input.accountSize,
      current_balance: input.accountSize,
      peak_balance: input.accountSize,
      profit_target_pct: product.profitTargetPct,
      daily_loss_limit_pct: product.dailyDrawdownLimitPct,
      daily_drawdown_limit_pct: product.dailyDrawdownLimitPct,
      max_drawdown_pct: product.maxDrawdownLimitPct,
      max_drawdown_limit_pct: product.maxDrawdownLimitPct,
      min_trading_days: product.minTradingDays,
      max_trading_days: product.maxTradingDays,
      max_calendar_days: product.maxTradingDays,
      trading_days_completed: 0,
      profit_pct: 0,
      max_daily_drawdown_pct: 0,
      leverage: product.leverage,
      platform: product.platform,
      profit_split_pct: product.profitSplitPct,
      payout_schedule: product.payoutSchedule,
      status: 'active',
      started_at: now,
      expires_at: expiresAt,
      created_at: now,
    })
    .select()
    .single();

  if (challengeError || !challengeAccount) {
    return {
      success: false,
      challengeAccountId: null,
      tradingAccountId: null,
      loginId,
      password,
      emailSent: false,
      product,
      error: `Failed to create challenge account: ${challengeError?.message}`,
    };
  }

  // 2. Create trading_account with production parameters
  const { data: tradingAccount, error: tradingError } = await supabase
    .from('trading_accounts')
    .insert({
      trader_id: input.userId,
      order_id: input.orderId,
      challenge_id: challengeAccount.id,
      account_code: loginId,
      login: loginId,
      plan: product.slug,
      broker_provider: product.brokerProvider,
      platform: product.platform,
      leverage: product.leverage,
      balance: input.accountSize,
      phase: product.startingPhase,
      status: 'active',
      created_at: now,
    })
    .select()
    .single();

  if (tradingError) {
    console.error('Failed to create trading account:', tradingError);
    // Non-fatal — challenge account still exists
  }

  // 3. Create provisioning_logs record
  const { error: provError } = await supabase
    .from('provisioning_logs')
    .insert({
      order_id: input.orderId,
      trader_id: input.userId,
      trading_account_id: tradingAccount?.id || null,
      challenge_account_id: challengeAccount.id,
      plan: product.slug,
      payment_method: input.paymentMethod,
      payment_ref: input.paymentRef,
      source: input.source,
      status: 'completed',
      started_at: now,
      completed_at: now,
    });

  if (provError) {
    console.error('Failed to create provisioning log:', provError);
    // Non-fatal
  }

  // 4. Send credentials email
  const emailResult = await sendEmail({
    to: input.userEmail,
    subject: 'Your FundedWealth Trading Account is Ready!',
    html: credentialsEmailTemplate({
      userName: input.userName,
      loginId,
      password,
      accountSize: input.accountSize,
      challengeType: product.displayName,
      platform: product.platform,
      leverage: product.leverage,
      profitTarget: product.profitTargetPct,
      dailyDrawdown: product.dailyDrawdownLimitPct,
      maxDrawdown: product.maxDrawdownLimitPct,
    }),
  });

  return {
    success: true,
    challengeAccountId: challengeAccount.id,
    tradingAccountId: tradingAccount?.id || null,
    loginId,
    password,
    emailSent: emailResult.success,
    product,
  };
}

// ---------------------------------------------------------------------------
// Email Template — includes full account parameters
// ---------------------------------------------------------------------------

function credentialsEmailTemplate(params: {
  userName: string;
  loginId: string;
  password: string;
  accountSize: number;
  challengeType: string;
  platform: string;
  leverage: string;
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
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
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Platform:</td><td style="padding:4px 0;font-size:14px;">${params.platform}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Leverage:</td><td style="padding:4px 0;font-size:14px;">${params.leverage}</td></tr>
        </table>
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;margin:24px 0;">
        <h3 style="margin:0 0 12px;font-size:14px;color:#1e40af;">Trading Rules</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Profit Target:</td><td style="padding:4px 0;font-size:14px;">${params.profitTarget}%</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Daily Drawdown Limit:</td><td style="padding:4px 0;font-size:14px;">${params.dailyDrawdown}%</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Max Drawdown Limit:</td><td style="padding:4px 0;font-size:14px;">${params.maxDrawdown}%</td></tr>
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
