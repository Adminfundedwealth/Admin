export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationEngine } from '@/lib/notifications/engine';
import { sendAccountBreachedEmail, sendAccountSuspendedEmail } from '@/lib/email/send-trader-email';

/**
 * POST /api/webhooks/terminal
 * 
 * Receives lifecycle callbacks from the Terminal project.
 * Events: provisioning.completed, provisioning.failed, challenge.passed,
 *   challenge.failed, account.suspended, account.breached, risk.violation
 *
 * Auth: Bearer token (TERMINAL_WEBHOOK_SECRET)
 * Does NOT create duplicate tables — writes to admin-only tables (notifications, audit_records).
 * Reads from shared tables (provisioning_logs, challenge_accounts, risk_alerts).
 */

interface TerminalEvent {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret — always return 401 for bad/missing auth (fail closed)
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.TERMINAL_WEBHOOK_SECRET;

    // If secret is unconfigured or mismatched, reject with 401 (don't leak config state)
    if (!expectedSecret || !authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: 'Invalid webhook authentication' },
        { status: 401 }
      );
    }

    const body: TerminalEvent = await request.json();
    const { event, timestamp, data } = body;

    if (!event || !data) {
      return NextResponse.json(
        { error: 'Invalid payload: event and data required' },
        { status: 400 }
      );
    }

    // Route event to handler
    switch (event) {
      case 'provisioning.completed':
        await handleProvisioningCompleted(data);
        break;
      case 'provisioning.failed':
        await handleProvisioningFailed(data);
        break;
      case 'challenge.passed':
        await handleChallengeLifecycle('passed', data);
        break;
      case 'challenge.failed':
        await handleChallengeLifecycle('failed', data);
        break;
      case 'account.suspended':
        await handleAccountStatus('suspended', data);
        break;
      case 'account.breached':
        await handleAccountStatus('breached', data);
        break;
      case 'risk.violation':
        await handleRiskViolation(data);
        break;
      case 'payment.completed':
        await handlePaymentEvent('completed', data);
        break;
      case 'payment.failed':
        await handlePaymentEvent('failed', data);
        break;
      default:
        // Unknown event — log but don't reject (forward compatibility)
        console.warn(`[Webhook] Unknown terminal event: ${event}`);
    }

    return NextResponse.json({ received: true, event });
  } catch (err) {
    console.error('[Webhook] Terminal callback error:', err);
    return NextResponse.json(
      { error: 'Internal processing error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleProvisioningCompleted(data: Record<string, unknown>) {
  const orderId = data.order_id as string;
  const challengeAccountId = data.challenge_account_id as string;
  const tradingAccountId = data.trading_account_id as string;

  await notificationEngine.broadcast({
    permission: 'challenges.view',
    priority: 'medium',
    title: 'Account Provisioned',
    message: `Order ${orderId?.slice(0, 8)?.toUpperCase()} provisioned successfully.`,
    eventSource: 'terminal.provisioning',
    linkTo: `/purchases/${orderId}`,
  });
}

async function handleProvisioningFailed(data: Record<string, unknown>) {
  const orderId = data.order_id as string;
  const errorMessage = data.error_message as string;

  await notificationEngine.broadcast({
    permission: 'challenges.manage',
    priority: 'high',
    title: 'Provisioning Failed',
    message: `Order ${orderId?.slice(0, 8)?.toUpperCase()} provisioning failed: ${errorMessage || 'Unknown error'}`,
    eventSource: 'terminal.provisioning',
    linkTo: `/purchases/${orderId}`,
  });
}

async function handleChallengeLifecycle(
  status: 'passed' | 'failed',
  data: Record<string, unknown>
) {
  const challengeId = data.challenge_account_id as string;
  const traderId = data.trader_id as string;
  const priority = status === 'passed' ? 'medium' : 'low';
  const title = status === 'passed' ? 'Challenge Passed' : 'Challenge Failed';

  await notificationEngine.broadcast({
    permission: 'challenges.view',
    priority,
    title,
    message: `Challenge ${challengeId?.slice(0, 8)?.toUpperCase()} ${status}.`,
    eventSource: 'terminal.challenge',
    linkTo: `/challenges/${challengeId}`,
  });
}

async function handleAccountStatus(
  status: 'suspended' | 'breached',
  data: Record<string, unknown>
) {
  const accountId = data.account_id as string;
  const userId = data.user_id as string;
  const reason = data.reason as string;
  const priority = status === 'breached' ? 'high' : 'medium';

  await notificationEngine.broadcast({
    permission: 'risk.view',
    priority,
    title: `Account ${status === 'breached' ? 'Breached' : 'Suspended'}`,
    message: `Account ${accountId?.slice(0, 8)?.toUpperCase()} ${status}${reason ? ': ' + reason : ''}.`,
    eventSource: 'terminal.account',
    linkTo: `/funded/${accountId}`,
  });

  // Send email to trader (non-blocking)
  if (userId) {
    if (status === 'breached') {
      sendAccountBreachedEmail(userId, accountId || '', reason || '').catch(() => {});
    } else {
      sendAccountSuspendedEmail(userId, accountId || '', reason || '').catch(() => {});
    }
  }
}

async function handleRiskViolation(data: Record<string, unknown>) {
  const alertId = data.alert_id as string;
  const severity = data.severity as string;
  const alertType = data.alert_type as string;
  const priority = severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium';

  await notificationEngine.broadcast({
    permission: 'risk.view',
    priority: priority as any,
    title: `Risk Violation: ${alertType || 'Unknown'}`,
    message: `Severity: ${severity}. ${(data.description as string) || ''}`.trim(),
    eventSource: 'terminal.risk',
    linkTo: `/risk`,
  });
}

async function handlePaymentEvent(
  status: 'completed' | 'failed',
  data: Record<string, unknown>
) {
  const orderId = data.order_id as string;
  const amount = data.amount as number;
  const priority = status === 'failed' ? 'high' : 'low';

  await notificationEngine.broadcast({
    permission: 'payments.view',
    priority,
    title: `Payment ${status === 'completed' ? 'Received' : 'Failed'}`,
    message: `Order ${orderId?.slice(0, 8)?.toUpperCase()}${amount ? ` — ₹${amount.toLocaleString()}` : ''} ${status}.`,
    eventSource: 'mainsite.payment',
    linkTo: `/payments/${orderId}`,
  });
}
