import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/payouts/[id]
 * Full payout detail with status history.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data: payout, error } = await supabase
      .from('payout_requests')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !payout) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Payout not found' } }, { status: 404 });
    }

    // Fetch status history
    const { data: historyData } = await supabase
      .from('payout_status_history')
      .select('*')
      .eq('payout_id', params.id)
      .order('created_at', { ascending: false });

    const history = (historyData || []).map((h) => ({
      id: h.id,
      type: 'status_change',
      title: `${(h.previous_status || 'new').replace(/_/g, ' ')} → ${h.new_status.replace(/_/g, ' ')}`,
      description: h.reason || '',
      actor: h.changed_by?.slice(0, 8) || '',
      timestamp: h.created_at,
    }));

    return NextResponse.json({ data: { payout, history } });
  } catch (err) {
    console.error('Payout detail error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payout' } }, { status: 500 });
  }
}
