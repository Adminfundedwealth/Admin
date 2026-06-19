import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/challenges/[id]
 * Full challenge detail with timeline history.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data: challenge, error } = await supabase
      .from('challenge_accounts')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Challenge not found' } }, { status: 404 });
    }

    // Fetch timeline
    const { data: timelineData } = await supabase
      .from('challenge_timeline')
      .select('id, action, reason, actor_id, metadata, created_at')
      .eq('challenge_account_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const timeline = (timelineData || []).map((t) => ({
      id: t.id,
      type: t.action,
      title: t.action.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: t.reason || '',
      actor: t.actor_id?.slice(0, 8) || 'System',
      timestamp: t.created_at,
    }));

    return NextResponse.json({ data: { challenge, timeline } });
  } catch (err) {
    console.error('Challenge detail error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch challenge' } }, { status: 500 });
  }
}
