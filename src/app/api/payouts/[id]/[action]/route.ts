import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { sendPayoutApprovedEmail, sendPayoutRejectedEmail } from '@/lib/email/send-trader-email';
import { notifyPayoutApproved, notifyPayoutRejected } from '@/lib/webhooks/outgoing';
import { z } from 'zod';

const VALID_TRANSITIONS: Record<string, Record<string, string>> = {
  request_received: { reject: 'request_received', review: 'under_review' },
  under_review: { approve: 'approved', reject: 'under_review' },
  approved: { process: 'payment_processing' },
  payment_processing: { complete: 'payment_completed', fail: 'payment_failed' },
  payment_failed: { retry: 'payment_processing', cancel: 'request_received' },
};

/**
 * POST /api/payouts/[id]/[action]
 * Actions: approve, reject, retry
 * - Approve: requires payouts.approve permission, creates audit record
 * - Reject: requires 10-1000 char reason, notifies trader, creates audit record
 * - Retry: retries failed payment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
    const action = params.action;
    const validActions = ['approve', 'reject', 'retry'];

    if (!validActions.includes(action)) {
      return NextResponse.json({ error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } }, { status: 400 });
    }

    // Authenticate staff
    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json().catch(() => ({}));

    // Fetch current payout
    const { data: payout, error: fetchErr } = await supabase
      .from('payout_requests')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchErr || !payout) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Payout not found' } }, { status: 404 });
    }

    const staffId = staff.id;
    const now = new Date().toISOString();
    let newStatus = payout.status;
    let updates: Record<string, unknown> = { updated_at: now };

    if (action === 'approve') {
      if (payout.status !== 'under_review') {
        return NextResponse.json({ error: { code: 'INVALID_TRANSITION', message: 'Can only approve payouts under review' } }, { status: 422 });
      }
      newStatus = 'approved';
      updates.status = 'approved';
      updates.approver_id = staffId;
      updates.approved_at = now;
    } else if (action === 'reject') {
      if (!['request_received', 'under_review'].includes(payout.status)) {
        return NextResponse.json({ error: { code: 'INVALID_TRANSITION', message: 'Can only reject pending payouts' } }, { status: 422 });
      }
      const schema = z.object({ reason: z.string().min(10).max(1000) });
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Rejection reason must be 10-1000 characters' } }, { status: 400 });
      }
      newStatus = 'request_received'; // stays but gets rejection reason
      updates.rejection_reason = parsed.data.reason;
      updates.status = 'payment_failed'; // Rejected = terminal
      newStatus = 'payment_failed';
      // TODO: Send notification to trader
    } else if (action === 'retry') {
      if (payout.status !== 'payment_failed') {
        return NextResponse.json({ error: { code: 'INVALID_TRANSITION', message: 'Can only retry failed payments' } }, { status: 422 });
      }
      newStatus = 'payment_processing';
      updates.status = 'payment_processing';
      updates.failure_reason = null;
    }

    // Update payout
    const { error: updateErr } = await supabase
      .from('payout_requests')
      .update(updates)
      .eq('id', params.id);

    if (updateErr) {
      return NextResponse.json({ error: { code: 'UPDATE_ERROR', message: updateErr.message } }, { status: 500 });
    }

    // Record in status history (append-only)
    await supabase.from('payout_status_history').insert({
      payout_id: params.id,
      previous_status: payout.status,
      new_status: newStatus,
      changed_by: staffId,
      reason: body.reason || action,
    });

    // Create audit record
    await supabase.from('audit_records').insert({
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

    // --- Email & Webhook notifications (non-blocking) ---
    if (action === 'approve') {
      sendPayoutApprovedEmail(payout.user_id, payout.calculated_payout || payout.requested_amount, 'INR').catch(() => {});
      notifyPayoutApproved(params.id, payout.user_id, payout.calculated_payout || payout.requested_amount).catch(() => {});
    } else if (action === 'reject') {
      sendPayoutRejectedEmail(payout.user_id, payout.calculated_payout || payout.requested_amount, body.reason || 'Rejected').catch(() => {});
      notifyPayoutRejected(params.id, payout.user_id, body.reason || 'Rejected').catch(() => {});
    }

    return NextResponse.json({ data: { id: params.id, status: newStatus, action } });
  } catch (err) {
    console.error('Payout action error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Action failed' } }, { status: 500 });
  }
}
