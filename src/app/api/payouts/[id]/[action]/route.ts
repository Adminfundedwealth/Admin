export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { sendPayoutApprovedEmail, sendPayoutRejectedEmail } from '@/lib/email/send-trader-email';
import { notifyPayoutApproved, notifyPayoutRejected } from '@/lib/webhooks/outgoing';
import { z } from 'zod';

// ── Certificate Engine config ─────────────────────────────────────────────────
const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.MAINSITE_API_URL || '';
const BACKEND_API_SECRET = process.env.BACKEND_API_SECRET || process.env.INTERNAL_PROVISION_SECRET || '';

/**
 * Trigger certificate generation via the backend engine.
 * Non-blocking — runs fire-and-forget after payout approval.
 * Inserts a pending placeholder immediately so the UI shows it right away,
 * then calls the backend engine to generate the actual PDF.
 */
async function triggerCertificateGeneration(
  supabase: ReturnType<typeof createAdminClient>,
  payout: {
    id: string;
    user_id: string;
    funded_account_id?: string | null;
    calculated_payout?: number | null;
    requested_amount?: number | null;
  },
  staffId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const amount = payout.calculated_payout ?? payout.requested_amount ?? 0;

  // Insert pending placeholder — visible in Certificate Center immediately
  const { data: placeholder, error: insertErr } = await supabase
    .from('certificates')
    .insert({
      user_id: payout.user_id,
      payout_id: payout.id,
      account_id: payout.funded_account_id ?? null,
      certificate_type: 'profit_certificate',
      amount,
      status: 'pending',
      issued_by: staffId,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertErr || !placeholder) {
    console.error('[Certificate] Failed to insert pending placeholder:', insertErr?.message);
    return;
  }

  // If no backend URL configured, leave as pending — staff can regenerate manually
  if (!BACKEND_API_URL) {
    console.warn('[Certificate] BACKEND_API_URL not set — certificate left pending.');
    return;
  }

  try {
    const backendRes = await fetch(`${BACKEND_API_URL}/api/certificates/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': BACKEND_API_SECRET,
        'x-certificate-id': placeholder.id,
      },
      body: JSON.stringify({
        certificate_id: placeholder.id,
        user_id: payout.user_id,
        payout_id: payout.id,
        account_id: payout.funded_account_id ?? null,
        certificate_type: 'profit_certificate',
        amount,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (backendRes.ok) {
      const result = await backendRes.json();
      const r = result?.data ?? {};
      await supabase
        .from('certificates')
        .update({
          status: 'generated',
          generated_at: now,
          updated_at: now,
          ...(r.download_url       ? { download_url: r.download_url }             : {}),
          ...(r.preview_url        ? { preview_url: r.preview_url }               : {}),
          ...(r.verification_url   ? { verification_url: r.verification_url }     : {}),
          ...(r.certificate_number ? { certificate_number: r.certificate_number } : {}),
        })
        .eq('id', placeholder.id);
    } else {
      const errBody = await backendRes.json().catch(() => ({}));
      const reason = (errBody as any)?.error?.message || `Backend returned ${backendRes.status}`;
      console.error('[Certificate] Backend error:', reason);
      await supabase
        .from('certificates')
        .update({ status: 'failed', failure_reason: reason, updated_at: now })
        .eq('id', placeholder.id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Certificate] Backend unreachable:', msg);
    await supabase
      .from('certificates')
      .update({ status: 'failed', failure_reason: msg, updated_at: now })
      .eq('id', placeholder.id);
  }
}

/**
 * POST /api/payouts/[id]/[action]
 * Actions: approve, reject, retry
 *
 * approve – marks payout approved, triggers certificate generation (non-blocking)
 * reject  – requires 10-1000 char reason, notifies trader
 * retry   – retries a failed payment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
    const action = params.action;
    const validActions = ['approve', 'reject', 'retry'];

    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
        { status: 400 },
      );
    }

    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    const supabase = createAdminClient();
    const body = await request.json().catch(() => ({}));

    // LIVE TABLE: payout_requests not in schema cache — use payout_reviews
    const { data: payout, error: fetchErr } = await supabase
      .from('payout_reviews')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchErr || !payout) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Payout not found' } },
        { status: 404 },
      );
    }

    const staffId = staff.id;
    const now = new Date().toISOString();
    let newStatus = payout.status;
    const updates: Record<string, unknown> = { updated_at: now };

    if (action === 'approve') {
      if (payout.status !== 'under_review') {
        return NextResponse.json(
          { error: { code: 'INVALID_TRANSITION', message: 'Can only approve payouts under review' } },
          { status: 422 },
        );
      }
      newStatus = 'approved';
      updates.status = 'approved';
      updates.approver_id = staffId;
      updates.approved_at = now;

    } else if (action === 'reject') {
      if (!['request_received', 'under_review'].includes(payout.status)) {
        return NextResponse.json(
          { error: { code: 'INVALID_TRANSITION', message: 'Can only reject pending payouts' } },
          { status: 422 },
        );
      }
      const schema = z.object({ reason: z.string().min(10).max(1000) });
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Rejection reason must be 10-1000 characters' } },
          { status: 400 },
        );
      }
      updates.rejection_reason = parsed.data.reason;
      updates.status = 'payment_failed';
      newStatus = 'payment_failed';

      // Notify trader
      sendPayoutRejectedEmail(
        payout.user_id,
        payout.calculated_payout || payout.requested_amount,
        parsed.data.reason,
      ).catch(() => {});
      notifyPayoutRejected(params.id, payout.user_id, parsed.data.reason).catch(() => {});

    } else if (action === 'retry') {
      if (payout.status !== 'payment_failed') {
        return NextResponse.json(
          { error: { code: 'INVALID_TRANSITION', message: 'Can only retry failed payments' } },
          { status: 422 },
        );
      }
      newStatus = 'payment_processing';
      updates.status = 'payment_processing';
      updates.failure_reason = null;
    }

    // Persist payout status change
    const { error: updateErr } = await supabase
      .from('payout_reviews')
      .update(updates)
      .eq('id', params.id);

    if (updateErr) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: updateErr.message } },
        { status: 500 },
      );
    }

    // Audit record (fire-and-forget)
    void supabase.from('audit_records').insert({
      actor_id: staffId,
      actor_role: 'staff',
      action: `payout.${action}`,
      target_entity_type: 'payout_request',
      target_entity_id: params.id,
      previous_state: { status: payout.status },
      new_state: { status: newStatus },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      device_info: { userAgent: request.headers.get('user-agent') || '' },
    });

    // Post-approve side effects (non-blocking)
    if (action === 'approve') {
      sendPayoutApprovedEmail(
        payout.user_id,
        payout.calculated_payout || payout.requested_amount,
        'INR',
      ).catch(() => {});

      notifyPayoutApproved(
        params.id,
        payout.user_id,
        payout.calculated_payout || payout.requested_amount,
      ).catch(() => {});

      // Server-side certificate generation — fires regardless of which UI surface
      // triggered the approve (list page, detail page, batch action).
      triggerCertificateGeneration(supabase, payout, staffId).catch((err) => {
        console.error('[Certificate] Auto-generation failed (non-fatal):', err);
      });
    }

    return NextResponse.json({ data: { id: params.id, status: newStatus, action } });
  } catch (err) {
    console.error('Payout action error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Action failed' } },
      { status: 500 },
    );
  }
}
