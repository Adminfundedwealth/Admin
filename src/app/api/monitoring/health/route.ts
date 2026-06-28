export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET() {
  try {
    const { error: authError } = await requirePermissionInHandler('system.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data } = await supabase.from('system_health_checks').select('*').order('checked_at', { ascending: false }).limit(6);
    return NextResponse.json({ data: data || [] });
  } catch { return NextResponse.json({ data: [] }); }
}
