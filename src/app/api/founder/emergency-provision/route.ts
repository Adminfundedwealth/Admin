export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import {
  fetchCatalog,
  resolveSizeIndex,
  type CatalogProduct,
} from '@/lib/provisioning/mainsite-provision';
import {
  generateTerminalCredentials,
  type TerminalCredentials,
} from '@/lib/provisioning/credentials';
import { z } from 'zod';

/**
 * GET /api/founder/emergency-provision
 * Returns the live challenge catalog.
 */
export async function GET() {
  try {
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;
    const catalog = await fetchCatalog();

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
      rules: {
        profitTargetPct: p.rules.profitTargetPct,
        dailyLossLimitPct: p.rules.dailyLossLimitPct,
        maxDrawdownPct: p.rules.maxDrawdownPct,
        minTradingDays: p.rules.minTradingDays,
        maxDaysAllowed: p.rules.maxDaysAllowed,
        type: p.rules.type,
      },
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
    console.error('Emergency provision GET error:', err);
    return NextResponse.json(
      { error: { code: 'CATALOG_UNAVAILABLE', message: err instanceof Error ? err.message : 'Failed to load products' } },
      { status: 500 },
    );
  }
}

const EmergencyProvisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  challenge_type: z.string().min(1, 'Challenge type is required'),
  account_size: z.number().positive('Account size must be positive'),
});

/**
 * POST /api/founder/emergency-provision
 *
 * Provisions a trading account directly in this Supabase instance.
 * Does NOT call the main site API — the main site uses a separate DB and
 * its /api/provisioning/emergency endpoint fails with FK errors when the
 * user does not exist in the main site's own database.
 *
 * Flow:
 *  1. Auth
 *  2. Validate input against catalog
 *  3. Resolve / create user (public.users + Supabase Auth)
 *  4. Duplicate check
 *  5. Direct DB provisioning:
 *     terminal_traders → challenge_accounts → trading_accounts → orders → provisioning_logs
 *  6. Save credentials to trading_accounts.broker_credentials_encrypted
 *  7. Audit log
 *  8. Return full result with credentials
 */
export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const { staff: authenticatedStaff, error: authError } = await requireFounderInHandler();
    if (authError) return authError;
    const staff = authenticatedStaff!;

    // ── 2. Parse & validate ──────────────────────────────────────────────────
    const body = await request.json();
    const parsed = EmergencyProvisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 },
      );
    }
    const { name, email, phone, challenge_type, account_size } = parsed.data;

    // ── 3. Validate against catalog ──────────────────────────────────────────
    const catalog = await fetchCatalog();
    const product: CatalogProduct | undefined = catalog.find((p) => p.slug === challenge_type);
    if (!product) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `Invalid challenge type: "${challenge_type}". Valid: ${catalog.map((p) => p.slug).join(', ')}` } },
        { status: 400 },
      );
    }
    const sizeIndex = resolveSizeIndex(catalog, challenge_type, account_size);
    if (sizeIndex === null) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `₹${account_size.toLocaleString()} is not valid for ${product.displayLabel}. Valid: ${product.sizes.map((s) => s.sizeLabel).join(', ')}` } },
        { status: 400 },
      );
    }

    // ── 4. Resolve or create user ────────────────────────────────────────────
    const supabase = createAdminClient();
    const credentials: TerminalCredentials = generateTerminalCredentials();

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', email.toLowerCase())
      .single();

    let userId: string;
    let userCreated = false;

    if (existingUser) {
      userId = existingUser.id;

      // Update Supabase Auth password so they can log in with new credentials
      const { data: profileData } = await supabase.from('users').select('clerk_id').eq('id', existingUser.id).single();
      let authUserId: string | null = profileData?.clerk_id || null;

      if (!authUserId) {
        const { data: authUserData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const matchingAuthUser = authUserData?.users?.find((u) => u.email === email.toLowerCase());
        authUserId = matchingAuthUser?.id || null;
      }

      if (authUserId) {
        await supabase.auth.admin.updateUserById(authUserId, {
          password: credentials.temporary_password,
          email_confirm: true,
        }).catch((e) => console.error('[EmergencyProvision] Password update failed:', e));
      }
    } else {
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(' ') || null;

      // Check for existing Supabase Auth user
      const { data: existingAuthData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existingAuthUser = existingAuthData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      ) || null;

      let authUserId: string;

      if (existingAuthUser) {
        authUserId = existingAuthUser.id;
        await supabase.auth.admin.updateUserById(authUserId, {
          password: credentials.temporary_password,
          email_confirm: true,
        }).catch(() => {});
      } else {
        const { data: authData, error: authCreateError } = await supabase.auth.admin.createUser({
          email: email.toLowerCase(),
          password: credentials.temporary_password,
          email_confirm: true,
          user_metadata: { full_name: name.trim(), first_name: firstName, last_name: lastName },
        });
        if (authCreateError || !authData?.user) {
          return NextResponse.json(
            { error: { code: 'USER_CREATE_FAILED', message: `Failed to create auth user: ${authCreateError?.message}` } },
            { status: 500 },
          );
        }
        authUserId = authData.user.id;
      }

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          clerk_id: authUserId,
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (userError || !newUser) {
        if (!existingAuthUser) await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
        return NextResponse.json(
          { error: { code: 'USER_CREATE_FAILED', message: `Failed to create user profile: ${userError?.message}` } },
          { status: 500 },
        );
      }

      userId = newUser.id;
      userCreated = true;

      if (phone) {
        await supabase.from('users').update({ phone }).eq('id', userId);
      }
    }

    // ── 5. Duplicate check ───────────────────────────────────────────────────
    const { data: existingBeforeProvision } = await supabase
      .from('trading_accounts')
      .select('id, account_code, status, balance, created_at')
      .eq('trader_id', (await supabase.from('terminal_traders').select('id').eq('external_id', userId).single()).data?.id ?? 'none')
      .not('status', 'in', '("closed","rejected")')
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingBeforeProvision && existingBeforeProvision.length > 0) {
      const existing = existingBeforeProvision[0];
      return NextResponse.json(
        {
          success: false,
          existing_account: true,
          data: {
            user_id: userId,
            user_email: email,
            user_name: name,
            trading_account_id: existing.id,
            terminal_login: existing.account_code,
            terminal_email: email.toLowerCase(),
            terminal_url: process.env.TERMINAL_BASE_URL || 'https://terminal.fundedwealth.com',
            account_size: existing.balance,
            challenge_type,
            status: existing.status,
          },
          error: {
            code: 'EXISTING_ACCOUNT',
            message: `User already has an active account: ${existing.account_code}. Duplicate provision blocked.`,
          },
        },
        { status: 409 },
      );
    }

    // ── 6. Direct DB provisioning ────────────────────────────────────────────
    const now = new Date().toISOString();
    const orderId = `emrg-${Date.now()}-${userId.slice(0, 8)}`;

    const planTypeMap: Record<string, string> = {
      flash:   'flash_funding',
      instant: 'instant_funding',
      '1step': 'evaluation_phase1',
      '2step': 'evaluation_phase1',
    };
    const challengeAccountType = planTypeMap[challenge_type] ?? challenge_type;

    // 6a. Upsert terminal_traders
    const { data: existingTrader } = await supabase
      .from('terminal_traders')
      .select('id')
      .eq('external_id', userId)
      .single();

    let traderId: string;
    if (existingTrader) {
      traderId = existingTrader.id;
    } else {
      const { data: newTrader, error: traderErr } = await supabase
        .from('terminal_traders')
        .insert({
          external_id: userId,
          email: email.toLowerCase(),
          display_name: name.trim(),
          plan: challenge_type,
          status: 'active',
          preferences: {},
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (traderErr || !newTrader) {
        return NextResponse.json(
          { error: { code: 'PROVISION_FAILED', message: `Failed to create trader profile: ${traderErr?.message}` } },
          { status: 500 },
        );
      }
      traderId = newTrader.id;
    }

    // 6b. Create challenge_account
    const { data: challengeAccount, error: caErr } = await supabase
      .from('challenge_accounts')
      .insert({
        trader_id: traderId,
        type: challengeAccountType,
        plan: `${Math.round(account_size / 1000)}k-${challenge_type}`,
        initial_balance: account_size,
        current_balance: account_size,
        peak_balance: account_size,
        profit_target_pct: product.rules.profitTargetPct,
        daily_loss_limit_pct: product.rules.dailyLossLimitPct,
        max_drawdown_pct: product.rules.maxDrawdownPct,
        min_trading_days: product.rules.minTradingDays,
        max_calendar_days: product.rules.maxDaysAllowed > 1 ? product.rules.maxDaysAllowed : null,
        status: 'active',
        started_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (caErr || !challengeAccount) {
      return NextResponse.json(
        { error: { code: 'PROVISION_FAILED', message: `Failed to create challenge account: ${caErr?.message}` } },
        { status: 500 },
      );
    }

    // 6c. Create trading_account
    const accountCode = `FW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data: tradingAccount, error: taErr } = await supabase
      .from('trading_accounts')
      .insert({
        trader_id: traderId,
        challenge_id: challengeAccount.id,
        account_code: accountCode,
        broker_provider: 'paper',
        balance: account_size,
        available_margin: account_size,
        used_margin: 0,
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (taErr || !tradingAccount) {
      return NextResponse.json(
        { error: { code: 'PROVISION_FAILED', message: `Failed to create trading account: ${taErr?.message}` } },
        { status: 500 },
      );
    }

    // 6d. Create order record
    const sizeEntry = product.sizes.find((s) => s.accountSize === account_size);
    try {
      await supabase.from('orders').insert({
        id: orderId,
        user_id: userId,
        amount: sizeEntry?.fee ?? 0,
        account_size,
        plan_type: challenge_type,
        status: 'completed',
        payment_method: 'founder_emergency',
        created_at: now,
        updated_at: now,
      });
    } catch (orderErr) {
      console.error('[EmergencyProvision] Order insert failed (non-fatal):', orderErr);
    }

    // 6e. Create provisioning_log
    const { data: provLog } = await supabase
      .from('provisioning_logs')
      .insert({
        trader_id: traderId,
        trading_account_id: tradingAccount.id,
        challenge_account_id: challengeAccount.id,
        order_id: orderId,
        plan: challenge_type,
        payment_method: 'founder_emergency',
        payment_ref: `founder_emergency_provision|product=${challenge_type}|size=${account_size}`,
        source: 'founder_emergency',
        status: 'completed',
        started_at: now,
        completed_at: now,
        created_at: now,
      })
      .select('id')
      .single();

    // ── 7. Save credentials ──────────────────────────────────────────────────
    const terminalLogin = accountCode;
    const credPayload = JSON.stringify({
      terminal_login: terminalLogin,
      temporary_password: credentials.temporary_password,
      activation_token: credentials.activation_token,
      credential_expiry: credentials.expiry,
      provisioned_by: 'founder_emergency',
      provisioned_at: now,
      product_slug: challenge_type,
      account_size,
    });
    await supabase
      .from('trading_accounts')
      .update({ broker_credentials_encrypted: credPayload })
      .eq('id', tradingAccount.id);

    // ── 8. SSO launch URL ────────────────────────────────────────────────────
    const terminalBaseUrl = process.env.TERMINAL_BASE_URL || 'https://terminal.fundedwealth.com';
    const ssoApiKey = process.env.SSO_API_KEY || process.env.TERMINAL_SSO_API_KEY || '';
    let launchUrl = `${terminalBaseUrl}/auth/sso?token=${encodeURIComponent(credentials.activation_token)}`;

    if (ssoApiKey) {
      try {
        const ssoRes = await fetch(`${terminalBaseUrl}/auth/sso/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sso-api-key': ssoApiKey },
          body: JSON.stringify({
            fwUserId: userId,
            traderId,
            accountId: tradingAccount.id,
            challengeId: challengeAccount.id,
            accountCode: terminalLogin,
            plan: challenge_type,
            email: email.toLowerCase(),
            name: name.trim(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (ssoRes.ok) {
          const ssoData = await ssoRes.json() as { launchUrl?: string; url?: string; token?: string };
          const resolvedUrl = ssoData.launchUrl || ssoData.url ||
            (ssoData.token ? `${terminalBaseUrl}/auth/sso?token=${encodeURIComponent(ssoData.token)}` : null);
          if (resolvedUrl) launchUrl = resolvedUrl;
        }
      } catch { /* non-fatal */ }
    }

    // ── 9. Re-read stored account for verification ───────────────────────────
    const { data: storedChallengeAccount } = await supabase
      .from('challenge_accounts')
      .select('id, type, plan, initial_balance, current_balance, profit_target_pct, daily_loss_limit_pct, max_drawdown_pct, min_trading_days, max_calendar_days, status, started_at, expires_at')
      .eq('id', challengeAccount.id)
      .single();

    const verification = {
      provisioned_slug: challenge_type,
      stored_type: storedChallengeAccount?.type ?? null,
      stored_plan: storedChallengeAccount?.plan ?? null,
      stored_initial_balance: storedChallengeAccount?.initial_balance ?? null,
      catalog_profit_target_pct: product.rules.profitTargetPct,
      catalog_daily_loss_pct: product.rules.dailyLossLimitPct,
      catalog_max_drawdown_pct: product.rules.maxDrawdownPct,
      credentials_generated: true,
      terminal_login_set: !!terminalLogin,
      checks: {
        product_preserved: storedChallengeAccount?.type === challengeAccountType,
        balance_correct: storedChallengeAccount?.initial_balance === account_size,
        credentials_ready: !!terminalLogin && !!credentials.temporary_password,
        launch_url_built: !!launchUrl,
      },
    };

    // ── 10. Audit log ────────────────────────────────────────────────────────
    const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
    const ipAddress = rawIp.split(',')[0].trim();
    try {
      await auditLogger.log({
        actorId: staff.id,
        actorRole: 'Founder',
        action: 'provision.emergency_manual',
        targetEntityType: 'user',
        targetEntityId: userId,
        newState: {
          email, name,
          challenge_account_id: challengeAccount.id,
          trading_account_id: tradingAccount.id,
          account_code: terminalLogin,
          account_size,
          challenge_type,
          source: 'founder_emergency',
          verification,
        },
        ipAddress,
        deviceInfo: {
          fingerprint: 'founder-emergency-provision',
          browser: request.headers.get('user-agent') || 'unknown',
          os: 'server',
          ipAddress,
        },
        metadata: {
          phone: phone || null,
          user_existed: !userCreated,
          provisioning_log_id: provLog?.id ?? null,
          order_id: orderId,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    // ── 11. Return ────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        user_id: userId,
        user_email: email,
        user_name: name,
        challenge_account_id: challengeAccount.id,
        trading_account_id: tradingAccount.id,
        terminal_login: terminalLogin,
        terminal_email: email.toLowerCase(),
        temporary_password: credentials.temporary_password,
        activation_token: credentials.activation_token,
        credential_expiry: credentials.expiry,
        terminal_url: terminalBaseUrl,
        launch_url: launchUrl,
        account_size,
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
        stored_rules: storedChallengeAccount
          ? {
              type: storedChallengeAccount.type,
              plan: storedChallengeAccount.plan,
              initial_balance: storedChallengeAccount.initial_balance,
              profit_target_pct: storedChallengeAccount.profit_target_pct,
              daily_loss_limit_pct: storedChallengeAccount.daily_loss_limit_pct,
              max_drawdown_pct: storedChallengeAccount.max_drawdown_pct,
              min_trading_days: storedChallengeAccount.min_trading_days,
              max_calendar_days: storedChallengeAccount.max_calendar_days,
              status: storedChallengeAccount.status,
            }
          : null,
        verification,
        user_created: userCreated,
        provisioned_at: now,
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
