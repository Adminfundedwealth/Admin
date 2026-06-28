export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  
  await supabase.from('promotions').update({ status: 'expired' }).eq('status', 'active').lt('end_date', now);
  await supabase.from('coupon_codes').update({ status: 'expired' }).eq('status', 'active').lt('end_date', now);
  
  return NextResponse.json({ success: true });
}
