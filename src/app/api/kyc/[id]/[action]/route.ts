export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { sendKycApprovedEmail, sendKycRejectedEmail } from '@/lib/email/send-trader-email';
import { notifyKycApproved, notifyKycRejected } from '@/lib/webhooks/outgoing';

/**
 * POST /api/kyc/[id]/approve|reject|resubmit
 * KYC review actions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
    // Authenticate staff
    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const submissionId = params.id;
    const action = params.action;

    const validActions = ['approve', 'reject', 'resubmit'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: `Invalid action: ${action}` } },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // Fetch current submission
    const { data: submission } = await supabase
      .from('kyc_submissions')
      .select('status, user_id')
      .eq('id', submissionId)
      .single();

    if (!submission) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
        { status: 404 }
      );
    }

    if (!['pending', 'in_review'].includes(submission.status)) {
      return NextResponse.json(
        { error: { code: 'INVALID_STATE', message: 'Submission cannot be reviewed in current state' } },
        { status: 400 }
      );
    }

    // Validate reason for reject/resubmit
    if ((action === 'reject' || action === 'resubmit') && (!body.reason || body.reason.length < 10)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Reason must be at least 10 characters' } },
        { status: 400 }
      );
    }

    // Map to new status
    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      resubmit: 'resubmit_requested',
    };
    const newStatus = statusMap[action];

    const updateData: Record<string, any> = {
      status: newStatus,
      reviewer_id: staff.id,
      reviewed_at: new Date().toISOString(),
    };

    if (body.reason) {
      updateData.rejection_reason = body.reason;
    }

    const { error } = await supabase
      .from('kyc_submissions')
      .update(updateData)
      .eq('id', submissionId);

    if (error) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Update user kyc_status
    if (newStatus === 'approved') {
      await supabase.from('users').update({ kyc_status: 'verified' }).eq('id', submission.user_id);
      // Email trader + notify Main Site & Terminal (non-blocking)
      sendKycApprovedEmail(submission.user_id).catch(() => {});
      notifyKycApproved(submission.user_id, submissionId).catch(() => {});
    } else if (newStatus === 'rejected') {
      await supabase.from('users').update({ kyc_status: 'rejected' }).eq('id', submission.user_id);
      // Email trader + notify Main Site (non-blocking)
      sendKycRejectedEmail(submission.user_id, body.reason ? [body.reason] : []).catch(() => {});
      notifyKycRejected(submission.user_id, submissionId, body.reason ? [body.reason] : []).catch(() => {});
    }

    // Audit record
    await supabase.from('audit_records').insert({
      actor_id: staff.id,
      actor_role: staff.roles[0] || 'staff',
      action: `kyc.${action}`,
      target_entity_type: 'kyc_submission',
      target_entity_id: submissionId,
      previous_state: { status: submission.status },
      new_state: { status: newStatus, reason: body.reason || null },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      device_info: { userAgent: request.headers.get('user-agent') || '' },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('KYC action error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Action failed' } },
      { status: 500 }
    );
  }
}
