export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  await supabase.from('kyc_submissions')
    .update({ overdue: true })
    .eq('status', 'pending')
    .eq('overdue', false)
    .lt('created_at', fortyEightHoursAgo);
  
  return NextResponse.json({ success: true });
}
