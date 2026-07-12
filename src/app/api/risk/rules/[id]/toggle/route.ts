export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * POST /api/risk/rules/[id]/toggle
 * Enable or disable a risk rule without editing its value.
 * Body: { is_active: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error: authError } = await requirePermissionInHandler('risk.edit');
    if (authError) return authError;

    const { id } = params;
    const body = await request.json();

    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('risk_rules')
      .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, rule_type, is_active')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, rule: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
