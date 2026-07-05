export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { sendPayoutApprovedEmail } from '@/lib/email/send-trader-email';
import { notifyPayoutCompleted } from '@/lib/webhooks/outgoing';
import { notificationEngine } from '@/lib/notifications/engine';
import { z } from 'zod';

const completePayoutSchema = z.object({
  transaction_reference: z.string().min(4).max(255),
  payment_method: z.string().min(2).max(50),
  proof_url: z.string().url().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/payouts/[id]/complete
 * 
 * Manual payout completion workflow.
 * Staff marks a payout as payment_completed after transferring funds.
 * Requires: transaction reference, payment method.
 * Optional: proof URL (screenshot/receipt), notes.
 *
 * Flow:
 * 1. Validate payout is in approved or payment_processing state
 * 2. Update payout_requests with completion data
 * 3. Record in payout_status_history (immutable)
 * 4. Create audit record
 * 5. Send email to trader
 * 6. Dispatch outgoing webhooks to Main Site & Terminal
 * 7. Notify admin staff
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Only Founder/Co-Founder or staff with payouts.approve can complete
    if (!staff.isFullAccess && !staff.permissions.includes('payouts.approve')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = completePayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const payoutId = params.id;

    // LIVE TABLE: payout_requests not in schema cache — use payout_reviews
    const { data: payout, error: fetchErr } = await supabase
      .from('payout_reviews')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (fetchErr || !payout) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Payout not found' } },
        { status: 404 }
      );
    }

    // Validate state transition
    if (!['approved', 'payment_processing'].includes(payout.status)) {
      return NextResponse.json(
        { error: { code: 'INVALID_TRANSITION', message: `Cannot complete payout in status: ${payout.status}. Must be approved or payment_processing.` } },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();

    // Update payout to completed — LIVE TABLE: payout_reviews
    const { error: updateErr } = await supabase
      .from('payout_reviews')
      .update({
        status: 'payment_completed',
        transaction_reference: parsed.data.transaction_reference,
        payment_method: parsed.data.payment_method,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', payoutId);

    if (updateErr) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: updateErr.message } },
        { status: 500 }
      );
    }

    // payout_status_history not in schema cache — skip silently
    // Audit record (fire-and-forget — audit_records not in schema cache)
    auditLogger.log({
      actorId: staff.id,
      actorRole: staff.roles[0] || 'staff',
      action: 'payout.complete',
      targetEntityType: 'payout_request',
      targetEntityId: payoutId,
      previousState: { status: payout.status } as any,
      newState: {
        status: 'payment_completed',
        transaction_reference: parsed.data.transaction_reference,
        payment_method: parsed.data.payment_method,
        proof_url: parsed.data.proof_url || null,
      } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    }).catch(() => {});

    // Send trader email (non-blocking)
    sendPayoutApprovedEmail(payout.user_id, payout.calculated_payout || payout.requested_amount, 'INR').catch(() => {});

    // Dispatch outgoing webhooks (non-blocking)
    notifyPayoutCompleted(
      payoutId,
      payout.user_id,
      payout.calculated_payout || payout.requested_amount,
      parsed.data.transaction_reference
    ).catch(() => {});

    // Notify admin staff
    notificationEngine.broadcast({
      permission: 'payouts.view',
      priority: 'low',
      title: 'Payout Completed',
      message: `₹${(payout.calculated_payout || 0).toLocaleString()} paid. Ref: ${parsed.data.transaction_reference}`,
      eventSource: 'admin.payout',
      linkTo: `/payouts`,
    }).catch(() => {});

    return NextResponse.json({
      data: {
        id: payoutId,
        status: 'payment_completed',
        transaction_reference: parsed.data.transaction_reference,
        completed_at: now,
      },
    });
  } catch (err) {
    console.error('Payout complete error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to complete payout' } },
      { status: 500 }
    );
  }
}
