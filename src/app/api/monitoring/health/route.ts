import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from('system_health_checks').select('*').order('checked_at', { ascending: false }).limit(6);
    return NextResponse.json({ data: data || [] });
  } catch { return NextResponse.json({ data: [] }); }
}
