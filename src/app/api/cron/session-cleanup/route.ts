import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  
  // Remove expired sessions
  await supabase.from('staff_sessions').delete().lt('expires_at', now);
  
  // Invalidate idle sessions (30 min)
  const idleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await supabase.from('staff_sessions').update({ invalidated_at: now }).lt('last_activity', idleCutoff).is('invalidated_at', null);
  
  return NextResponse.json({ success: true });
}
