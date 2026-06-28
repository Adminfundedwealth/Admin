export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  
  // Mark expired exports
  await supabase.from('data_exports').update({ status: 'failed' }).eq('status', 'completed').lt('expires_at', now);
  
  return NextResponse.json({ success: true });
}
