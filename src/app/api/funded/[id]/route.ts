import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

/**
 * GET /api/funded/[id]
 * Full funded account detail with performance data and eligibility.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data: account, error } = await supabase
      .from('funded_accounts')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 });
    }

    // Get user KYC status for eligibility
    const { data: user } = await supabase
      .from('users')
      .select('kyc_status')
      .eq('id', account.user_id)
      .single();

    // Calculate eligibility criteria
    const eligibility = {
      min_trading_days: true, // TODO: check actual trading days
      profit_threshold: account.profit_loss > 0,
      no_violations: account.violation_count === 0,
      kyc_verified: user?.kyc_status === 'verified',
    };

    // Get trade stats
    const { data: trades } = await supabase
      .from('trades')
      .select('profit_loss')
      .eq('account_id', params.id)
      .eq('account_type', 'funded')
      .eq('status', 'closed');

    const closedTrades = trades || [];
    const wins = closedTrades.filter(t => (t.profit_loss || 0) > 0);
    const losses = closedTrades.filter(t => (t.profit_loss || 0) < 0);

    const tradeStats = {
      total: closedTrades.length,
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      avgWin: wins.length > 0 ? wins.reduce((s, t) => s + (t.profit_loss || 0), 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.profit_loss || 0), 0) / losses.length) : 0,
    };

    // Equity curve (last 30 days - simplified)
    const equityCurve: { date: string; equity: number }[] = [];

    return NextResponse.json({
      data: { account, eligibility, tradeStats, equityCurve },
    });
  } catch (err) {
    console.error('Funded detail error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch account' } }, { status: 500 });
  }
}

/**
 * PATCH /api/funded/[id]
 * Modify a funded account (requires reason, creates audit record).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const schema = z.object({ reason: z.string().min(10) });
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Reason must be at least 10 characters' } }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Create audit record
    await supabase.from('audit_records').insert({
      actor_id: '00000000-0000-0000-0000-000000000000', // TODO: from session
      actor_role: 'staff',
      action: 'funded_account.modified',
      target_entity_type: 'funded_account',
      target_entity_id: params.id,
      previous_state: null,
      new_state: { reason: parsed.data.reason },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      device_info: { userAgent: request.headers.get('user-agent') || '' },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('Funded modify error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Modification failed' } }, { status: 500 });
  }
}
