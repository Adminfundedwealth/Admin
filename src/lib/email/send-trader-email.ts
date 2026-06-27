import { sendEmail, getUserEmail } from './client';
import {
  kycApprovedEmail,
  kycRejectedEmail,
  payoutApprovedEmail,
  payoutRejectedEmail,
  accountBreachedEmail,
  accountSuspendedEmail,
} from './templates';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * High-level trader email dispatch functions.
 * Resolves user email from shared users table, sends via Resend, logs result.
 * Non-blocking — errors are logged but don't throw.
 */

export async function sendKycApprovedEmail(userId: string): Promise<void> {
  try {
    const { email, name } = await resolveUser(userId);
    if (!email) return;

    const template = kycApprovedEmail(name);
    await sendEmail({ to: email, ...template });
  } catch (err) {
    console.error('[Email] sendKycApprovedEmail failed:', err);
  }
}

export async function sendKycRejectedEmail(userId: string, reasons: string[]): Promise<void> {
  try {
    const { email, name } = await resolveUser(userId);
    if (!email) return;

    const template = kycRejectedEmail(name, reasons);
    await sendEmail({ to: email, ...template });
  } catch (err) {
    console.error('[Email] sendKycRejectedEmail failed:', err);
  }
}

export async function sendPayoutApprovedEmail(userId: string, amount: number, currency = 'INR'): Promise<void> {
  try {
    const { email, name } = await resolveUser(userId);
    if (!email) return;

    const template = payoutApprovedEmail(name, amount, currency);
    await sendEmail({ to: email, ...template });
  } catch (err) {
    console.error('[Email] sendPayoutApprovedEmail failed:', err);
  }
}

export async function sendPayoutRejectedEmail(userId: string, amount: number, reason: string): Promise<void> {
  try {
    const { email, name } = await resolveUser(userId);
    if (!email) return;

    const template = payoutRejectedEmail(name, amount, reason);
    await sendEmail({ to: email, ...template });
  } catch (err) {
    console.error('[Email] sendPayoutRejectedEmail failed:', err);
  }
}

export async function sendAccountBreachedEmail(userId: string, accountId: string, reason: string): Promise<void> {
  try {
    const { email, name } = await resolveUser(userId);
    if (!email) return;

    const template = accountBreachedEmail(name, accountId, reason);
    await sendEmail({ to: email, ...template });
  } catch (err) {
    console.error('[Email] sendAccountBreachedEmail failed:', err);
  }
}

export async function sendAccountSuspendedEmail(userId: string, accountId: string, reason: string): Promise<void> {
  try {
    const { email, name } = await resolveUser(userId);
    if (!email) return;

    const template = accountSuspendedEmail(name, accountId, reason);
    await sendEmail({ to: email, ...template });
  } catch (err) {
    console.error('[Email] sendAccountSuspendedEmail failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveUser(userId: string): Promise<{ email: string | null; name: string }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('users')
    .select('email, first_name, last_name')
    .eq('id', userId)
    .single();

  if (!data?.email) {
    console.warn('[Email] User not found or no email:', userId);
    return { email: null, name: '' };
  }

  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || '';
  return { email: data.email, name };
}
