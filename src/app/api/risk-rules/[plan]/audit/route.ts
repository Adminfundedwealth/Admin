export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { terminalAdminFetch, auditPath, isValidPlan } from '@/lib/api/terminal';

/**
 * GET /api/risk-rules/[plan]/audit
 * Proxies to Terminal GET /api/admin/[plan]/audit
 * Returns the audit log for the given plan profile.
 * Query: ?limit=50 (default 50, max 200)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { plan: string } }
) {
  const { error: authError, staff } = await requireFounderInHandler();
  if (authError) return authError;

  const { plan } = params;
  if (!isValidPlan(plan)) {
    return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
  }

  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)));

  try {
    const res = await terminalAdminFetch(
      `${auditPath(plan)}?limit=${limit}`,
      { method: 'GET' },
      staff!.id,
    );

    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    console.error(`[risk-rules/${plan}/audit] GET error:`, err.message);
    return NextResponse.json(
      { error: { code: 'TERMINAL_ERROR', message: err.message } },
      { status: 502 }
    );
  }
}