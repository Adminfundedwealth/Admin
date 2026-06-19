import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/users/[id]
 * Full user profile with all associated data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const userId = params.id;

    // Fetch user profile
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // Fetch counts in parallel
    const [challenges, funded, payouts, tickets, notes, timeline] = await Promise.all([
      supabase.from('challenge_accounts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('funded_accounts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('payout_requests').select('calculated_payout').eq('user_id', userId).eq('status', 'payment_completed'),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('user_notes').select('id, category, body, created_at, author_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('audit_records').select('id, action, timestamp, actor_role, metadata').eq('target_entity_id', userId).eq('target_entity_type', 'user').order('timestamp', { ascending: false }).limit(50),
    ]);

    const payoutTotal = (payouts.data || []).reduce((sum, p) => sum + (p.calculated_payout || 0), 0);

    // Map timeline events
    const timelineEvents = (timeline.data || []).map((record) => ({
      id: record.id,
      type: record.action,
      title: record.action.replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: '',
      actor: record.actor_role,
      timestamp: record.timestamp,
    }));

    return NextResponse.json({
      data: {
        profile: {
          ...user,
          challenge_count: challenges.count || 0,
          funded_count: funded.count || 0,
          payout_total: payoutTotal,
          ticket_count: tickets.count || 0,
        },
        notes: notes.data || [],
        timeline: timelineEvents,
      },
    });
  } catch (err) {
    console.error('User profile error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user profile' } },
      { status: 500 }
    );
  }
}
