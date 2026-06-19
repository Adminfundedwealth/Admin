import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('staff_members').select('id, name, email, status, totp_enabled, created_at').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch { return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 }); }
}
