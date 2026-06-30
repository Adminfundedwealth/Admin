export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import {
  fetchCatalog,
  provisionViaMainSite,
  resolveSizeIndex,
  MainSiteError,
  type PlanSlug,
} from '@/lib/provisioning/mainsite-provision';
import { z } from 'zod';

/**
 * GET /api/founder/emergency-provision
 *
 * Returns the challenge catalog. The values come ENTIRELY from the Main
 * Website's single source of truth (@workspace/products) via the production
 * `/api/provisioning/catalog` endpoint. The Admin holds NO product, size or
 * risk values of its own — if production changes, this reflects it automatically.
 */
export async function GET() {
  try {
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    const catalog = await fetchCatalog();

    // Forward the EXACT marketing display strings the website pricing cards show.
    // Both the website (checkout.ts → @workspace/products) and this endpoint
    // (catalog → @workspace/products) read the SAME source, so values are identical.
    const products = catalog.map((p) => ({
      slug: p.slug,
      displayName: p.displayLabel,
      profitTarget: p.profitTarget,
      maxLoss: p.maxLoss,
      dailyLoss: p.dailyLoss,
      minDays: p.minDays,
      leverage: p.leverage,
      profitSplit: p.profitSplit,
      duration: p.duration,
      phases: p.slug === '2step' ? 2 : 1,
      sizes: p.sizes.map((s) => ({
        accountSize: s.accountSize,
        sizeLabel: s.sizeLabel,
        fee: s.fee,
        popular: s.popular,
      })),
      accountSizes: p.sizes.map((s) => s.accountSize),
    }));

    return NextResponse.json({ products });
  } catch (err) {
    const status = err instanceof MainSiteError ? err.status : 500;
    console.error('Emergency provision GET error:', err);
    return NextResponse.json(
      { error: { code: 'CATALOG_UNAVAILABLE', message: err instanceof Error ? err.message : 'Failed to load products' } },
      { status: status >= 400 ? status : 500 },
    );
  }
}

/**
 * POST /api/founder/emergency-provision
 *
 * Founder Emergency Provision. Behaves EXACTLY like a website purchase except
 * payment is bypassed by Founder authorization, because it calls the SAME
 * production provisioning pipeline (`POST /api/provisioning/emergency` →
 * `provisionChallenge`). The Admin performs NO local provisioning, NO
 * credential generation, NO risk-rule mapping and NO challenge configuration.
 *
 * Flow:
 *   Founder auth → resolve/create user → resolve size index from production
 *   catalog → call production provisioning pipeline → audit → return.
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

    // 2. Parse request body
    const body = await request.json();
    const parsed = EmergencyProvisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 },
      );
    }

    const { name, email, phone, challenge_type, account_size } = parsed.data;

    // 3. Validate plan + size against the PRODUCTION catalog (single source of truth)
    const catalog = await fetchCatalog();
    const product = catalog.find((p) => p.slug === challenge_type);
    if (!product) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid challenge type: "${challenge_type}". Valid types: ${catalog.map((p) => p.slug).join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    const sizeIndex = resolveSizeIndex(catalog, challenge_type, account_size);
    if (sizeIndex === null) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `₹${account_size.toLocaleString()} is not a valid size for ${product.displayLabel}. Valid: ${product.sizes.map((s) => s.sizeLabel).join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // 4. Resolve or create the user (a website purchase is always by a registered user)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', email.toLowerCase())
      .single();

    let userId: string;
    let userCreated = false;

    if (existingUser) {
      userId = existingUser.id;
    } else {
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
          { status: 500 },
        );
      }

      userId = newUser.id;
      userCreated = true;
    }

    // 5. Call the PRODUCTION provisioning pipeline (same as a website purchase)
    let result;
    try {
      result = await provisionViaMainSite({
        planType: challenge_type as PlanSlug,
        sizeIndex,
        userId,
        email: email.toLowerCase(),
        note: 'founder_emergency_provision',
      });
    } catch (err) {
      const status = err instanceof MainSiteError ? err.status : 500;
      return NextResponse.json(
        { error: { code: 'PROVISION_FAILED', message: err instanceof Error ? err.message : 'Provisioning failed' } },
        { status: status >= 400 ? status : 500 },
      );
    }

    // 6. Audit log
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
          account_code: result.accountCode,
          account_size: result.accountSize,
          challenge_type,
          source: 'founder_emergency',
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
          user_existed: !userCreated,
          provisioning_log_id: result.provisioningLogId,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    // 7. Return success — display strings are IDENTICAL to the website pricing card
    return NextResponse.json({
      success: true,
      data: {
        user_id: userId,
        user_email: email,
        user_name: name,
        challenge_account_id: result.challengeAccountId,
        trading_account_id: result.tradingAccountId,
        account_code: result.accountCode,
        account_size: result.accountSize,
        challenge_type: product.slug,
        challenge_display_name: product.displayLabel,
        phases: product.slug === '2step' ? 2 : 1,
        profit_target: product.profitTarget,
        daily_loss: product.dailyLoss,
        max_loss: product.maxLoss,
        min_days: product.minDays,
        leverage: product.leverage,
        profit_split: product.profitSplit,
        duration: product.duration,
        user_created: userCreated,
        provisioned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Emergency provision error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Emergency provisioning failed unexpectedly' } },
      { status: 500 },
    );
  }
}
