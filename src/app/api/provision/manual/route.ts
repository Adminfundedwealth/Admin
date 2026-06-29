export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { sendEmail } from '@/lib/email/client';
import { z } from 'zod';
import { randomBytes } from 'crypto';

/**
 * POST /api/provision/manual
 *
 * Manual Provision MVP — provisions a trading account for a verified paid user.
 *
 * Flow:
 * 1. Validate input (order_id required, optional overrides)
 * 2. Verify order exists and is paid (status: completed/active/paid)
 * 3. Verify UTR reference matches
 * 4. Check not already provisioned
 * 5. Generate login ID + password
 * 6. Create challenge_account entry
 * 7. Update provisioning_logs
 * 8. Mark order as active
 * 9. Send credentials email to trader
 * 10. Write audit log
 *
 * Uses EXISTING shared tables only. Does NOT modify Terminal schema.
 */

const ManualProvisionSchema = z.object({
  order_id: z.string().min(1, 'Order ID is required'),
  utr_reference: z.string().min(1, 'UTR reference is required for verification'),
  challenge_type: z.enum(['evaluation', 'express', 'stellar']).default('evaluation'),
  account_size: z.number().positive().optional(),
  plan: z.string().optional(),
  notes: z.string().max(500).optional(),
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
    // 1. Auth — require Founder/Co-Founder access for manual provisioning
    const { staff, error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    // 2. Parse and validate body
    const body = await request.json();
    const parsed = ManualProvisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { order_id, utr_reference, challenge_type, account_size, plan, notes } = parsed.data;
    const supabase = createAdminClient();

    // 3. Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: { code: 'ORDER_NOT_FOUND', message: 'Order not found with the given ID' } },
        { status: 404 }
      );
    }

    // 4. Verify payment status
    const paidStatuses = ['completed', 'active', 'paid'];
    if (!paidStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: { code: 'ORDER_NOT_PAID', message: `Order status is "${order.status}". Only paid orders can be provisioned.` } },
        { status: 400 }
      );
    }

    // 5. Verify UTR reference matches
    if (order.utr_reference && order.utr_reference.toLowerCase() !== utr_reference.toLowerCase()) {
      return NextResponse.json(
        { error: { code: 'UTR_MISMATCH', message: 'UTR reference does not match the order record' } },
        { status: 400 }
      );
    }

    // 6. Check if already provisioned
    const { data: existingProvision } = await supabase
      .from('provisioning_logs')
      .select('id, status, trading_account_id, challenge_account_id')
      .eq('order_id', order_id)
      .in('status', ['completed', 'processing'])
      .limit(1);

    if (existingProvision && existingProvision.length > 0) {
      return NextResponse.json(
        { error: { code: 'ALREADY_PROVISIONED', message: 'This order has already been provisioned or is currently being processed.' } },
        { status: 409 }
      );
    }

    // 7. Resolve user
    const { data: user } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('id', order.user_id)
      .single();

    if (!user || !user.email) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'Could not resolve user for this order' } },
        { status: 404 }
      );
    }

    // 8. Generate credentials
    const loginId = generateLoginId();
    const password = generatePassword();
    const finalAccountSize = account_size || order.account_size || 25000;
    const finalPlan = plan || order.plan_type || challenge_type;

    // 9. Create challenge_account (the trading account record)
    const { data: challengeAccount, error: challengeError } = await supabase
      .from('challenge_accounts')
      .insert({
        trader_id: order.user_id,
        type: challenge_type,
        plan: finalPlan,
        initial_balance: finalAccountSize,
        current_balance: finalAccountSize,
        peak_balance: finalAccountSize,
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
      console.error('Failed to create challenge account:', challengeError);
      return NextResponse.json(
        { error: { code: 'PROVISION_FAILED', message: `Failed to create challenge account: ${challengeError?.message}` } },
        { status: 500 }
      );
    }

    // 10. Create provisioning log
    const { error: provError } = await supabase
      .from('provisioning_logs')
      .insert({
        order_id: order_id,
        trader_id: order.user_id,
        trading_account_id: null,
        challenge_account_id: challengeAccount.id,
        plan: finalPlan,
        payment_method: order.payment_method || 'manual',
        payment_ref: utr_reference,
        source: 'admin_manual',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

    if (provError) {
      console.error('Failed to create provisioning log:', provError);
      // Non-fatal — account is still created
    }

    // 11. Update order status to active
    await supabase
      .from('orders')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', order_id);

    // 12. Send credentials email
    const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Trader';
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Your FundedWealth Trading Account is Ready!',
      html: credentialsEmailTemplate({
        userName,
        loginId,
        password,
        accountSize: finalAccountSize,
        plan: finalPlan,
        challengeType: challenge_type,
      }),
    });

    // 13. Write audit log
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
    try {
      await auditLogger.log({
        actorId: staff!.id,
        actorRole: staff!.roles[0] || 'founder',
        action: 'provision.manual',
        targetEntityType: 'order',
        targetEntityId: order_id,
        previousState: { status: order.status },
        newState: {
          status: 'active',
          challenge_account_id: challengeAccount.id,
          login_id: loginId,
          account_size: finalAccountSize,
          plan: finalPlan,
        },
        ipAddress: ipAddress.split(',')[0].trim(),
        deviceInfo: {
          fingerprint: 'admin-manual-provision',
          browser: request.headers.get('user-agent') || 'unknown',
          os: 'server',
          ipAddress: ipAddress.split(',')[0].trim(),
        },
        metadata: {
          notes: notes || null,
          utr_reference,
          email_sent: emailResult.success,
          email_message_id: emailResult.messageId || null,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr);
    }

    // 14. Return success
    return NextResponse.json({
      success: true,
      data: {
        order_id,
        user_email: user.email,
        user_name: userName,
        challenge_account_id: challengeAccount.id,
        login_id: loginId,
        account_size: finalAccountSize,
        plan: finalPlan,
        challenge_type,
        email_sent: emailResult.success,
        provisioned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Manual provision error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Manual provisioning failed unexpectedly' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/provision/manual
 * Search for pending paid orders eligible for manual provisioning.
 * Supports search by email or UTR reference.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireFounderInHandler();
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const search = params.get('search')?.trim();

    if (!search || search.length < 3) {
      return NextResponse.json(
        { error: { code: 'SEARCH_REQUIRED', message: 'Provide at least 3 characters to search (email or UTR)' } },
        { status: 400 }
      );
    }

    // Search by email: first find user, then find their orders
    let orderResults: any[] = [];

    // Check if search looks like an email
    if (search.includes('@')) {
      const { data: users } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .ilike('email', `%${search}%`)
        .limit(10);

      if (users && users.length > 0) {
        const userIds = users.map(u => u.id);
        const { data: orders } = await supabase
          .from('orders')
          .select('*')
          .in('user_id', userIds)
          .in('status', ['completed', 'paid', 'active', 'pending', 'awaiting_payment'])
          .order('created_at', { ascending: false })
          .limit(20);

        const userMap = users.reduce((m: Record<string, any>, u) => { m[u.id] = u; return m; }, {});
        orderResults = (orders || []).map(o => ({
          ...o,
          user_email: userMap[o.user_id]?.email || '',
          user_name: [userMap[o.user_id]?.first_name, userMap[o.user_id]?.last_name].filter(Boolean).join(' '),
        }));
      }
    } else {
      // Search by UTR reference or order ID
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .or(`utr_reference.ilike.%${search}%,id.eq.${search}`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (orders && orders.length > 0) {
        const userIds = Array.from(new Set(orders.map(o => o.user_id).filter(Boolean)));
        const { data: users } = await supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .in('id', userIds);

        const userMap = (users || []).reduce((m: Record<string, any>, u) => { m[u.id] = u; return m; }, {});
        orderResults = orders.map(o => ({
          ...o,
          user_email: userMap[o.user_id]?.email || '',
          user_name: [userMap[o.user_id]?.first_name, userMap[o.user_id]?.last_name].filter(Boolean).join(' '),
        }));
      }
    }

    // Check provisioning status for found orders
    const orderIds = orderResults.map(o => o.id);
    let provisionMap: Record<string, string> = {};
    if (orderIds.length > 0) {
      const { data: provLogs } = await supabase
        .from('provisioning_logs')
        .select('order_id, status')
        .in('order_id', orderIds);

      provisionMap = (provLogs || []).reduce((m: Record<string, string>, l) => {
        m[l.order_id] = l.status;
        return m;
      }, {});
    }

    const results = orderResults.map(o => ({
      id: o.id,
      user_id: o.user_id,
      user_email: o.user_email,
      user_name: o.user_name,
      amount: o.amount,
      account_size: o.account_size,
      plan_type: o.plan_type,
      status: o.status,
      payment_method: o.payment_method,
      utr_reference: o.utr_reference,
      provisioning_status: provisionMap[o.id] || null,
      created_at: o.created_at,
      can_provision: ['completed', 'paid', 'active'].includes(o.status) && !['completed', 'processing'].includes(provisionMap[o.id]),
    }));

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error('Manual provision search error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Search failed' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Email Template
// ---------------------------------------------------------------------------

function credentialsEmailTemplate(params: {
  userName: string;
  loginId: string;
  password: string;
  accountSize: number;
  plan: string;
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
          <tr><td style="padding:4px 0;color:#666;font-size:13px;">Plan:</td><td style="padding:4px 0;font-size:14px;">${params.plan} (${params.challengeType})</td></tr>
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
