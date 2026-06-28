export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/staff/presence
 * Returns currently online staff (active session within last 30 min).
 */
export async function GET() {
  try {
    const { error: authError } = await requirePermissionInHandler('staff.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: sessions } = await supabase
      .from('staff_sessions')
      .select('staff_id, last_activity, device_fingerprint')
      .is('invalidated_at', null)
      .gt('last_activity', thirtyMinAgo)
      .order('last_activity', { ascending: false });

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get unique staff IDs
    const staffIds = Array.from(new Set(sessions.map(s => s.staff_id)));

    // Fetch staff names and roles
    const { data: staffMembers } = await supabase
      .from('staff_members')
      .select('id, name')
      .in('id', staffIds);

    const { data: roleAssignments } = await supabase
      .from('staff_role_assignments')
      .select('staff_id, roles!inner(name)')
      .in('staff_id', staffIds);

    const staffMap = new Map((staffMembers || []).map(s => [s.id, s.name]));
    const roleMap = new Map((roleAssignments || []).map(r => [r.staff_id, (r.roles as any)?.name || 'Staff']));

    const onlineStaff = staffIds.map(id => {
      const session = sessions.find(s => s.staff_id === id);
      const lastActivity = new Date(session?.last_activity || '');
      const minutesAgo = Math.floor((Date.now() - lastActivity.getTime()) / 60000);
      return {
        id,
        name: staffMap.get(id) || 'Unknown',
        role: roleMap.get(id) || 'Staff',
        currentModule: '/',
        lastActive: minutesAgo < 1 ? 'now' : `${minutesAgo}m ago`,
      };
    });

    return NextResponse.json({ data: onlineStaff });
  } catch (err) {
    console.error('Staff presence error:', err);
    return NextResponse.json({ data: [] });
  }
}
