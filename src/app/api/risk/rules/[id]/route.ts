export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * PATCH /api/risk/rules/[id]
 * Update the value of a single risk rule row.
 * Body: { value: object }
 * Takes effect on next trade validation — no deploy required.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('risk.edit');
    if (authError) return authError;

    const { id } = params;
    const body = await request.json();

    if (!body.value || typeof body.value !== 'object') {
      return NextResponse.json({ error: 'value must be a non-null object' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('risk_rules')
      .update({ value: body.value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, rule_type, value, is_active, updated_at')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, rule: data });
  } catch (err: any) {
    console.error('[API/risk/rules/[id]] PATCH error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
