export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/executive/activity
 * Returns the 20 most recent significant events across all operating centers.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    // audit_records may not be in schema cache — return empty list gracefully
    const { data: records, error } = await supabase
      .from('audit_records')
      .select('id, action, target_entity_type, target_entity_id, timestamp, metadata')
      .in('action', [
        'user.registered',
        'challenge.purchased',
        'challenge.passed',
        'challenge.failed',
        'funded_account.activated',
        'payout.requested',
        'payout.completed',
        'kyc.approved',
        'kyc.rejected',
        'risk.alert_generated',
      ])
      .order('timestamp', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Executive activity query failed:', {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: { code: 'ACTIVITY_QUERY_FAILED', message: 'Executive activity is temporarily unavailable' } },
        { status: 500 },
      );
    }

    const events = (records || []).map((record) => ({
      id: record.id,
      type: record.action.split('.')[1] || record.action,
      title: formatEventTitle(record.action),
      description: `${record.target_entity_type} ${record.target_entity_id.slice(0, 8)}...`,
      timestamp: record.timestamp,
    }));

    return NextResponse.json({ data: events });
  } catch (err) {
    console.error('Activity feed error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Executive activity is temporarily unavailable' } },
      { status: 500 },
    );
  }
}

function formatEventTitle(action: string): string {
  const titles: Record<string, string> = {
    'user.registered': 'New User Registered',
    'challenge.purchased': 'Challenge Purchased',
    'challenge.passed': 'Challenge Passed',
    'challenge.failed': 'Challenge Failed',
    'funded_account.activated': 'Funded Account Activated',
    'payout.requested': 'Payout Requested',
    'payout.completed': 'Payout Completed',
    'kyc.approved': 'KYC Approved',
    'kyc.rejected': 'KYC Rejected',
    'risk.alert_generated': 'Risk Alert Generated',
  };
  return titles[action] || action;
}
