export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearSessionCookies } from '@/lib/security/session-cookies';

/**
 * POST /api/auth/logout
 * Invalidate the current session and record logout timestamp.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Get session token from cookie or header
    const token = request.cookies.get('session_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');

    if (token) {
      const { createHash } = await import('crypto');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      // Invalidate the session
      await supabase
        .from('staff_sessions')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('token_hash', tokenHash);
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookies(response);

    return response;
  } catch (err) {
    console.error('Logout error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Logout failed' } },
      { status: 500 }
    );
  }
}
