import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Outgoing Webhook Dispatcher — notifies Main Site and Terminal of admin actions.
 * Uses shared webhook_outbox table for reliable delivery with retries.
 * Does NOT create duplicate tables — uses existing Supabase for persistence.
 *
 * Targets:
 *   - Main Site: MAINSITE_WEBHOOK_URL (payment confirmations, user status changes)
 *   - Terminal: TERMINAL_OUTGOING_WEBHOOK_URL (KYC approved, payout processed, account actions)
 */

export interface OutgoingWebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
  source: 'admin';
}

type WebhookTarget = 'mainsite' | 'terminal';

/**
 * Dispatch a webhook to a target service.
 * Attempts immediate delivery; on failure, queues for retry via cron.
 */
export async function dispatchWebhook(
  target: WebhookTarget,
  event: string,
  data: Record<string, unknown>
): Promise<{ sent: boolean; queued: boolean }> {
  const url = getTargetUrl(target);
  const secret = getTargetSecret(target);

  const payload: OutgoingWebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
    source: 'admin',
  };

  if (!url) {
    console.warn(`[Webhook Out] No URL configured for target: ${target}`);
    // Queue for later delivery when URL is configured
    await queueWebhook(target, event, payload);
    return { sent: false, queued: true };
  }

  // Attempt immediate delivery
  const sent = await sendWebhook(url, secret, payload);

  if (!sent) {
    // Queue for retry
    await queueWebhook(target, event, payload);
    return { sent: false, queued: true };
  }

  return { sent: true, queued: false };
}

/**
 * Send webhook HTTP request with Bearer auth and timeout.
 */
async function sendWebhook(
  url: string,
  secret: string | null,
  payload: OutgoingWebhookPayload
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Source': 'fundedwealth-admin',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
    };

    if (secret) {
      headers['Authorization'] = `Bearer ${secret}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[Webhook Out] ${payload.event} → ${url} failed: ${response.status}`);
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown';
    console.error(`[Webhook Out] ${payload.event} → ${url} error: ${message}`);
    return false;
  }
}

/**
 * Queue a failed webhook for retry via the cron worker.
 * Stores in admin-owned audit_records with a specific action prefix for identification.
 * We use notifications table with a system recipient to avoid creating new tables.
 *
 * Actually — we'll use a simple JSON approach in the existing background_jobs concept.
 * Since we must NOT create tables, we store retry state in audit_records metadata.
 */
async function queueWebhook(
  target: WebhookTarget,
  event: string,
  payload: OutgoingWebhookPayload
): Promise<void> {
  const supabase = createAdminClient();

  // Store in notifications as a system-level webhook-retry entry
  // recipient_id = system placeholder, event_source = 'webhook_outbox'
  // This avoids creating a new table while enabling retry cron to find pending webhooks.
  await supabase.from('notifications').insert({
    recipient_id: '00000000-0000-0000-0000-000000000001', // Founder as fallback recipient
    priority: 'low',
    title: `[WEBHOOK_RETRY] ${target}:${event}`,
    message: JSON.stringify(payload),
    event_source: 'webhook_outbox',
    link_to: null,
    read: false,
  });
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getTargetUrl(target: WebhookTarget): string | null {
  if (target === 'mainsite') {
    return process.env.MAINSITE_WEBHOOK_URL || null;
  }
  if (target === 'terminal') {
    return process.env.TERMINAL_OUTGOING_WEBHOOK_URL || null;
  }
  return null;
}

function getTargetSecret(target: WebhookTarget): string | null {
  if (target === 'mainsite') {
    return process.env.MAINSITE_WEBHOOK_SECRET || null;
  }
  if (target === 'terminal') {
    return process.env.TERMINAL_WEBHOOK_SECRET || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Convenience dispatchers for specific admin actions
// ---------------------------------------------------------------------------

export async function notifyKycApproved(userId: string, submissionId: string): Promise<void> {
  await dispatchWebhook('terminal', 'kyc.approved', { user_id: userId, submission_id: submissionId });
  await dispatchWebhook('mainsite', 'kyc.approved', { user_id: userId, submission_id: submissionId });
}

export async function notifyKycRejected(userId: string, submissionId: string, reasons: string[]): Promise<void> {
  await dispatchWebhook('mainsite', 'kyc.rejected', { user_id: userId, submission_id: submissionId, reasons });
}

export async function notifyPayoutApproved(payoutId: string, userId: string, amount: number): Promise<void> {
  await dispatchWebhook('terminal', 'payout.approved', { payout_id: payoutId, user_id: userId, amount });
  await dispatchWebhook('mainsite', 'payout.approved', { payout_id: payoutId, user_id: userId, amount });
}

export async function notifyPayoutCompleted(payoutId: string, userId: string, amount: number, reference: string): Promise<void> {
  await dispatchWebhook('terminal', 'payout.completed', { payout_id: payoutId, user_id: userId, amount, reference });
  await dispatchWebhook('mainsite', 'payout.completed', { payout_id: payoutId, user_id: userId, amount, reference });
}

export async function notifyPayoutRejected(payoutId: string, userId: string, reason: string): Promise<void> {
  await dispatchWebhook('mainsite', 'payout.rejected', { payout_id: payoutId, user_id: userId, reason });
}

export async function notifyAccountAction(accountId: string, userId: string, action: 'suspended' | 'breached' | 'reactivated', reason: string): Promise<void> {
  await dispatchWebhook('terminal', `account.${action}`, { account_id: accountId, user_id: userId, reason });
  await dispatchWebhook('mainsite', `account.${action}`, { account_id: accountId, user_id: userId, reason });
}

/**
 * Notify Main Site that a certificate has been issued.
 * Main Site can use this to:
 *   - Show the certificate badge/banner on the trader's dashboard
 *   - Update the trader's profile page with the verification link
 *   - Send a push/in-app notification to the trader
 *
 * Payload fields:
 *   certificate_id      – Admin certificates table UUID
 *   user_id             – Trader UUID
 *   payout_id           – Linked payout UUID (optional)
 *   certificate_type    – profit_certificate | funded_trader | phase_completion
 *   certificate_number  – Human-readable serial (e.g. FW-CERT-2026-0001)
 *   amount              – Amount shown on the certificate (INR, nullable)
 *   download_url        – Signed CDN URL for the PDF (nullable until generated)
 *   verification_url    – Public shareable verification link (nullable)
 */
export async function notifyCertificateIssued(
  certificateId: string,
  userId: string,
  opts: {
    payout_id?: string | null;
    certificate_type: string;
    certificate_number?: string | null;
    amount?: number | null;
    download_url?: string | null;
    verification_url?: string | null;
  },
): Promise<void> {
  await dispatchWebhook('mainsite', 'certificate.issued', {
    certificate_id: certificateId,
    user_id: userId,
    payout_id: opts.payout_id ?? null,
    certificate_type: opts.certificate_type,
    certificate_number: opts.certificate_number ?? null,
    amount: opts.amount ?? null,
    download_url: opts.download_url ?? null,
    verification_url: opts.verification_url ?? null,
  });
}
