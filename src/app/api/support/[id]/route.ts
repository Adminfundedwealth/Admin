export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/support/[id]
 * Full support ticket detail with conversation messages.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('support.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const ticketId = params.id;

    // Fetch ticket
    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Ticket not found' } },
        { status: 404 }
      );
    }

    // Fetch user info
    const { data: user } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', ticket.user_id)
      .single();

    // Fetch assigned agent name if assigned
    let assignedAgentName: string | null = null;
    if (ticket.assigned_agent_id) {
      const { data: agent } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', ticket.assigned_agent_id)
        .single();
      assignedAgentName = agent?.name || null;
    }

    // Fetch messages/conversation
    const { data: messages } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      data: {
        ticket: {
          ...ticket,
          user_email: user?.email || '',
          user_name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '',
          assigned_agent_name: assignedAgentName,
        },
        messages: messages || [],
      },
    });
  } catch (err) {
    console.error('Support ticket detail error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch ticket' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/[id]/reply
 * Add a reply or internal note to a ticket.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { getAuthenticatedStaff } = await import('@/lib/auth/get-staff');
    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const ticketId = params.id;
    const body = await request.json();
    const { body: messageBody, is_internal_note } = body;

    if (!messageBody || messageBody.length < 5) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Message must be at least 5 characters' } },
        { status: 400 }
      );
    }

    // Insert message
    const { error } = await supabase.from('support_messages').insert({
      ticket_id: ticketId,
      sender_type: 'agent',
      sender_id: staff.id,
      sender_name: staff.name,
      body: messageBody,
      is_internal_note: is_internal_note || false,
      attachments: [],
    });

    if (error) {
      // If support_messages table doesn't exist, report gracefully
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: { code: 'TABLE_NOT_FOUND', message: 'support_messages table not available' } },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: { code: 'WRITE_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Update ticket status to in_progress if it was open and this is an agent reply (not internal note)
    if (!is_internal_note) {
      await supabase
        .from('support_tickets')
        .update({ status: 'in_progress', first_response_at: new Date().toISOString() })
        .eq('id', ticketId)
        .eq('status', 'open');
    }

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('Support reply error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to send reply' } },
      { status: 500 }
    );
  }
}
