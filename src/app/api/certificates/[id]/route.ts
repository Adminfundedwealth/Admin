export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

/**
 * GET /api/certificates/[id]
 * Full certificate detail.
 * Requires: certificates.view
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { error: authError } = await requirePermissionInHandler('certificates.view');
    if (authError) return authError;

    const supabase = createAdminClient();

    const { data: cert, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !cert) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Certificate not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: cert });
  } catch (err) {
    console.error('[certificates/[id]] GET error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch certificate' } },
      { status: 500 },
    );
  }
}
