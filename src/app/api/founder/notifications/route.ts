export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';

/**
 * GET /api/founder/notifications
 * Fetch live notifications for the authenticated staff member.
 * Reads: notifications
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const unreadOnly = params.get('unread') === 'true';
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 30;
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('recipient_id', actor.id);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_ERROR', message: error.message } }, { status: 500 });
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', actor.id)
      .eq('read', false);

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
      unreadCount: unreadCount || 0,
    });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

/**
 * PATCH /api/founder/notifications
 * Mark notifications as read.
 * Writes: notifications
 */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const body = await request.json();
    const { ids, markAll } = body;

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    if (markAll) {
      await supabase
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('recipient_id', actor.id)
        .eq('read', false);
    } else if (ids && Array.isArray(ids)) {
      await supabase
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('recipient_id', actor.id)
        .in('id', ids);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Notifications mark read error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
