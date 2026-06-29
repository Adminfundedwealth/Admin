export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { provisionAccount } from '@/lib/provisioning/provision-account';
import { CHALLENGE_PRODUCTS, VALID_CHALLENGE_SLUGS, getProductConfig, isValidAccountSize } from '@/config/challenge-products';
import { z } from 'zod';

/**
 * GET /api/founder/emergency-provision
 *
 * Returns the available challenge products and their configurations.
 * The frontend uses this to populate the form with PRODUCTION options only.
 */
export async function GET() {
  try {
    const { staff, error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    return NextResponse.json({
      products: CHALLENGE_PRODUCTS.map((p) => ({
        slug: p.slug,
        displayName: p.displayName,
        accountSizes: p.accountSizes,
        phases: p.phases,
        profitTargetPct: p.profitTargetPct,
        dailyDrawdownLimitPct: p.dailyDrawdownLimitPct,
        maxDrawdownLimitPct: p.maxDrawdownLimitPct,
        minTradingDays: p.minTradingDays,
        maxTradingDays: p.maxTradingDays,
        leverage: p.leverage,
        platform: p.platform,
        profitSplitPct: p.profitSplitPct,
        payoutSchedule: p.payoutSchedule,
      })),
    });
  } catch (err) {
    console.error('Emergency provision GET error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load products' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/founder/emergency-provision
 *
 * Emergency Manual Provision — Founder-only.
 * Uses the EXACT SAME provisioning pipeline as a normal website purchase.
 * Creates user (if not present), then calls the shared provisionAccount() function.
 *
 * Duplicate protection: If the email already has an active trading account,
 * the request is rejected.
 */

const EmergencyProvisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  challenge_type: z.string().min(1, 'Challenge type is required'),
  account_size: z.number().positive('Account size must be positive'),
});

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

    // 3. Validate challenge_type against production products
    const product = getProductConfig(challenge_type);
    if (!product) {
      return NextResponse.json(
        { error: { code: 'INVALID_CHALLENGE_TYPE', message: `Invalid challenge type: "${challenge_type}". Valid types: ${VALID_CHALLENGE_SLUGS.join(', ')}` } },
        { status: 400 }
      );
    }

    // 4. Validate account size for this product
    if (!isValidAccountSize(challenge_type, account_size)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ACCOUNT_SIZE', message: `₹${account_size.toLocaleString()} is not a valid size for ${product.displayName}. Valid: ${product.accountSizes.map(s => '₹' + s.toLocaleString()).join(', ')}` } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 5. Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', email.toLowerCase())
      .single();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      // 6. Duplicate protection — check if this email already has an active trading account
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
      // 7. Create user
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

    // 8. Use the SHARED provisioning pipeline (same as normal checkout)
    const result = await provisionAccount({
      userId,
      userEmail: email.toLowerCase(),
      userName: name,
      challengeType: challenge_type,
      accountSize: account_size,
      source: 'founder_manual',
      orderId: null,
      paymentMethod: 'emergency_manual',
      paymentRef: `EMERGENCY-${Date.now()}`,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'PROVISION_FAILED', message: result.error || 'Provisioning failed' } },
        { status: 500 }
      );
    }

    // 9. Write audit log (admin_events)
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
          challenge_account_id: result.challengeAccountId,
          trading_account_id: result.tradingAccountId,
          login_id: result.loginId,
          account_size,
          challenge_type,
          product_slug: product.slug,
          product_display_name: product.displayName,
          phases: product.phases,
          profit_target_pct: product.profitTargetPct,
          daily_drawdown_limit_pct: product.dailyDrawdownLimitPct,
          max_drawdown_limit_pct: product.maxDrawdownLimitPct,
          leverage: product.leverage,
          platform: product.platform,
          profit_split_pct: product.profitSplitPct,
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
          email_sent: result.emailSent,
          user_existed: !!existingUser,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    // 10. Return success with credentials
    return NextResponse.json({
      success: true,
      data: {
        user_id: userId,
        user_email: email,
        user_name: name,
        challenge_account_id: result.challengeAccountId,
        trading_account_id: result.tradingAccountId,
        login_id: result.loginId,
        password: result.password,
        account_size,
        challenge_type: product.slug,
        challenge_display_name: product.displayName,
        phases: product.phases,
        profit_target_pct: product.profitTargetPct,
        daily_drawdown_limit_pct: product.dailyDrawdownLimitPct,
        max_drawdown_limit_pct: product.maxDrawdownLimitPct,
        leverage: product.leverage,
        platform: product.platform,
        profit_split_pct: product.profitSplitPct,
        payout_schedule: product.payoutSchedule,
        email_sent: result.emailSent,
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
