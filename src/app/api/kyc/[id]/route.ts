export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/kyc/[id]
 * Full KYC submission detail for review.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('kyc.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const submissionId = params.id;

    // Fetch submission
    const { data: submission, error } = await supabase
      .from('kyc_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (error || !submission) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'KYC submission not found' } },
        { status: 404 }
      );
    }

    // Fetch user info
    const { data: user } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', submission.user_id)
      .single();

    // Fetch reviewer name if reviewed
    let reviewerName: string | null = null;
    if (submission.reviewer_id) {
      const { data: reviewer } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', submission.reviewer_id)
        .single();
      reviewerName = reviewer?.name || null;
    }

    // Fetch timeline from audit_records
    const { data: auditData } = await supabase
      .from('audit_records')
      .select('id, action, timestamp, actor_role, metadata')
      .eq('target_entity_id', submissionId)
      .eq('target_entity_type', 'kyc_submission')
      .order('timestamp', { ascending: false })
      .limit(20);

    const timeline = (auditData || []).map((r: any) => ({
      id: r.id,
      type: r.action,
      title: r.action.replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: '',
      actor: r.actor_role,
      timestamp: r.timestamp,
    }));

    return NextResponse.json({
      data: {
        submission: {
          ...submission,
          user_email: user?.email || '',
          user_name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '',
          reviewer_name: reviewerName,
        },
        timeline,
      },
    });
  } catch (err) {
    console.error('KYC detail error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch KYC submission' } },
      { status: 500 }
    );
  }
}
