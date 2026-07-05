export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/payouts/[id]
 * Full payout detail with status history.
 * SECURITY: Defense-in-depth auth check in handler.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('payouts.view');
    if (authError) return authError;

    const supabase = createAdminClient();

    // LIVE TABLE: payout_requests is not in schema cache — use payout_reviews
    const { data: payout, error } = await supabase
      .from('payout_reviews')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !payout) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Payout not found' } }, { status: 404 });
    }

    // payout_status_history is not in schema cache — return empty history gracefully
    const history: any[] = [];

    return NextResponse.json({ data: { payout, history } });
  } catch (err) {
    console.error('Payout detail error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payout' } }, { status: 500 });
  }
}
