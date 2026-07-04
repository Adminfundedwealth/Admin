export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('support.view');
    if (authError) return authError;

    // Support tickets table does not exist in shared schema
    // Return empty data structure until table is created
    const params = request.nextUrl.searchParams;
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 20;

    return NextResponse.json({ 
      data: [], 
      meta: { page, pageSize, totalCount: 0, totalPages: 0 } 
    });
  } catch { 
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 }); 
  }
}
