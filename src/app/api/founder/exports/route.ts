export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';

/**
 * GET /api/founder/exports
 * List all data exports for this staff member.
 * Reads: data_exports
 */
export async function GET() {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Founder access required' } }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('data_exports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // Table may not exist yet — return empty
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('Exports fetch error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
