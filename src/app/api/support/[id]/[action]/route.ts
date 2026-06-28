export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';

/**
 * POST /api/support/[id]/escalate|resolve|close
 * Status transition actions for support tickets.
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
    const ticketId = params.id;
    const action = params.action;

    const validActions = ['escalate', 'resolve', 'close'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: `Invalid action: ${action}` } },
        { status: 400 }
      );
    }

    // Map action to new status
    const statusMap: Record<string, string> = {
      escalate: 'escalated',
      resolve: 'resolved',
      close: 'closed',
    };

    const newStatus = statusMap[action];
    const updateData: Record<string, any> = { status: newStatus };

    if (action === 'resolve') {
      updateData.resolved_at = new Date().toISOString();
    } else if (action === 'close') {
      updateData.closed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticketId);

    if (error) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Audit
    await supabase.from('audit_records').insert({
      actor_id: staff.id,
      actor_role: staff.roles[0] || 'staff',
      action: `support.${action}`,
      target_entity_type: 'support_ticket',
      target_entity_id: ticketId,
      previous_state: null,
      new_state: { status: newStatus },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      device_info: { userAgent: request.headers.get('user-agent') || '' },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('Support action error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Action failed' } },
      { status: 500 }
    );
  }
}
