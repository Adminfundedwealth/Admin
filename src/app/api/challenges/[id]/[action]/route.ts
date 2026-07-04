export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { z } from 'zod';

// Valid state transitions
const VALID_TRANSITIONS: Record<string, Record<string, string>> = {
  active: { pass: 'passed', fail: 'failed', extend: 'active', archive: 'archived' },
  passed: { upgrade: 'passed', archive: 'archived' },
  failed: { retry: 'active', reset: 'active', archive: 'archived' },
  expired: { reset: 'active', archive: 'archived' },
  archived: { restore: 'active' },
};

const actionSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

/**
 * POST /api/challenges/[id]/[action]
 * Perform a state transition on a challenge account.
 * Actions: pass, fail, retry, reset, extend, upgrade, archive, restore
 * 
 * - Pass/Fail require min 20 char justification and challenges.manage permission
 * - All actions require min 10 char reason
 * - Invalid transitions are rejected with current status and valid transitions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
    const body = await request.json();
    const action = params.action;

    // Validate action is known
    const validActions = ['pass', 'fail', 'retry', 'reset', 'extend', 'upgrade', 'archive', 'restore'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
        { status: 400 }
      );
    }

    // Pass/fail require 20 char min
    const minLength = (action === 'pass' || action === 'fail') ? 20 : 10;
    const schema = z.object({ reason: z.string().min(minLength, `Reason must be at least ${minLength} characters`) });
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Authenticate staff
    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    // Fetch current challenge
    const { data: challenge, error: fetchErr } = await supabase
      .from('challenge_accounts')
      .select('id, status, user_id, account_number, challenge_type, initial_balance, min_trading_days, max_trading_days, daily_drawdown_limit_pct, max_drawdown_limit_pct, profit_target_pct')
      .eq('id', params.id)
      .single();

    if (fetchErr || !challenge) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Challenge not found' } }, { status: 404 });
    }

    // Validate state transition
    const transitions = VALID_TRANSITIONS[challenge.status];
    if (!transitions || !transitions[action]) {
      const validForStatus = transitions ? Object.keys(transitions) : [];
      return NextResponse.json({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot perform '${action}' on a challenge with status '${challenge.status}'. Valid actions: ${validForStatus.join(', ') || 'none'}`,
        },
      }, { status: 422 });
    }

    const newStatus = transitions[action];
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: newStatus, updated_at: now };

    // Handle specific action logic
    if (action === 'pass' || action === 'fail') {
      updates.completed_at = now;
    }

    if (action === 'reset') {
      // Preserve original data by creating timeline entry, then reset metrics
      updates.profit_pct = 0;
      updates.max_daily_drawdown_pct = 0;
      updates.max_drawdown_pct = 0;
      updates.trading_days_completed = 0;
      updates.current_balance = challenge.initial_balance;
      updates.started_at = now;
      updates.completed_at = null;
    }

    // Update the challenge
    const { error: updateErr } = await supabase
      .from('challenge_accounts')
      .update(updates)
      .eq('id', params.id);

    if (updateErr) {
      return NextResponse.json({ error: { code: 'UPDATE_ERROR', message: updateErr.message } }, { status: 500 });
    }

    // Record in timeline
    await supabase.from('challenge_timeline').insert({
      challenge_account_id: params.id,
      action,
      actor_id: staff.id,
      reason: parsed.data.reason,
      metadata: { previous_status: challenge.status, new_status: newStatus },
    });

    // Create audit record
    await supabase.from('audit_records').insert({
      actor_id: staff.id,
      actor_role: staff.roles[0] || 'staff',
      action: `challenge.${action}`,
      target_entity_type: 'challenge_account',
      target_entity_id: params.id,
      previous_state: { status: challenge.status },
      new_state: { status: newStatus },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      device_info: { userAgent: request.headers.get('user-agent') || '' },
    });

    return NextResponse.json({ data: { id: params.id, status: newStatus, action } });
  } catch (err) {
    console.error('Challenge action error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Action failed' } }, { status: 500 });
  }
}
