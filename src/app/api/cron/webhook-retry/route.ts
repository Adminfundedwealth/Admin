export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/webhook-retry
 * 
 * Retries failed outgoing webhooks and provisioning failures.
 * Runs every 5 minutes via external cron (Vercel/Railway/etc).
 * Auth: CRON_SECRET Bearer token (enforced by middleware).
 *
 * Does NOT create duplicate tables — reads webhook_outbox entries
 * stored as notifications with event_source = 'webhook_outbox'.
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const results = { webhooksRetried: 0, webhooksSucceeded: 0, webhooksFailed: 0, provisioningRetried: 0 };

  // --- Part 1: Retry failed outgoing webhooks ---
  const { data: pendingWebhooks } = await supabase
    .from('notifications')
    .select('id, title, message, created_at')
    .eq('event_source', 'webhook_outbox')
    .eq('read', false)
    .order('created_at', { ascending: true })
    .limit(20);

  for (const entry of pendingWebhooks || []) {
    results.webhooksRetried++;

    // Parse target and event from title: "[WEBHOOK_RETRY] target:event"
    const titleMatch = entry.title.match(/\[WEBHOOK_RETRY\] (\w+):(.+)/);
    if (!titleMatch) {
      // Malformed entry — mark as read to stop retrying
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', entry.id);
      continue;
    }

    const target = titleMatch[1] as 'mainsite' | 'terminal';
    const url = target === 'mainsite'
      ? process.env.MAINSITE_WEBHOOK_URL
      : process.env.TERMINAL_OUTGOING_WEBHOOK_URL;

    const secret = target === 'mainsite'
      ? process.env.MAINSITE_WEBHOOK_SECRET
      : process.env.TERMINAL_WEBHOOK_SECRET;

    if (!url) {
      // Still no URL configured — skip but don't remove (will retry later)
      // If entry is older than 7 days, give up
      const age = Date.now() - new Date(entry.created_at).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', entry.id);
      }
      continue;
    }

    // Attempt delivery
    let payload: any;
    try {
      payload = JSON.parse(entry.message);
    } catch {
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', entry.id);
      continue;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'fundedwealth-admin',
        'X-Webhook-Retry': 'true',
      };
      if (secret) headers['Authorization'] = `Bearer ${secret}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        // Success — mark as delivered
        await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', entry.id);
        results.webhooksSucceeded++;
      } else {
        results.webhooksFailed++;
        // Check if too old (> 3 days) — give up
        const age = Date.now() - new Date(entry.created_at).getTime();
        if (age > 3 * 24 * 60 * 60 * 1000) {
          await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', entry.id);
        }
      }
    } catch {
      results.webhooksFailed++;
    }
  }

  // --- Part 2: Retry failed provisioning (notify terminal to retry) ---
  const { data: failedProvisioning } = await supabase
    .from('provisioning_logs')
    .select('id, order_id, status, error_message, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10);

  const terminalUrl = process.env.TERMINAL_OUTGOING_WEBHOOK_URL;
  const terminalSecret = process.env.TERMINAL_WEBHOOK_SECRET;

  if (terminalUrl && failedProvisioning && failedProvisioning.length > 0) {
    for (const log of failedProvisioning) {
      // Only retry provisioning that failed less than 24h ago
      const age = Date.now() - new Date(log.created_at).getTime();
      if (age > 24 * 60 * 60 * 1000) continue;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'fundedwealth-admin',
        };
        if (terminalSecret) headers['Authorization'] = `Bearer ${terminalSecret}`;

        const response = await fetch(terminalUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event: 'provisioning.retry_requested',
            timestamp: new Date().toISOString(),
            data: { order_id: log.order_id, provisioning_log_id: log.id, error_message: log.error_message },
            source: 'admin',
          }),
        });

        if (response.ok) {
          results.provisioningRetried++;
          // Update status to 'retrying' in shared table
          await supabase
            .from('provisioning_logs')
            .update({ status: 'retrying' })
            .eq('id', log.id)
            .eq('status', 'failed');
        }
      } catch {
        // Continue with next
      }
    }
  }

  return NextResponse.json({ success: true, results });
}
