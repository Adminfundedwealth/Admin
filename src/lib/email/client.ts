import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Email Client — sends transactional emails via Resend API.
 * Falls back to logging if RESEND_API_KEY is not configured.
 * Does NOT create duplicate tables.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@fundedwealth.com';
  const fromName = process.env.EMAIL_FROM_NAME || 'FundedWealth';

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured. Email not sent:', input.subject, '→', input.to);
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text || undefined,
        reply_to: input.replyTo || undefined,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Email] Resend API error:', response.status, err);
      return { success: false, error: `Resend API ${response.status}: ${err}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Send failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Resolve a user's email from their ID via the shared users table.
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();
  return data?.email || null;
}
