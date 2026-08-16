export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { terminalAdminFetch, profilePath, isValidPlan } from '@/lib/api/terminal';
import { validatePlanUpdates } from '@/lib/api/risk-rules-validation';

/**
 * GET /api/risk-rules/[plan]
 * Proxies to Terminal GET /api/admin/[plan]/profile
 * Returns the current live risk profile for the given plan.
 *
 * PUT /api/risk-rules/[plan]
 * Proxies to Terminal PUT /api/admin/[plan]/profile
 * Updates risk profile fields. Validates values before forwarding.
 * Cache is invalidated immediately on the Terminal side.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { plan: string } }
) {
  const { error: authError, staff } = await requireFounderInHandler();
  if (authError) return authError;

  const { plan } = params;
  if (!isValidPlan(plan)) {
    return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
  }

  try {
    const res = await terminalAdminFetch(profilePath(plan), { method: 'GET' }, staff!.id);

    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    console.error(`[risk-rules/${plan}] GET error:`, err.message);
    return NextResponse.json(
      { error: { code: 'TERMINAL_ERROR', message: err.message } },
      { status: 502 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { plan: string } }
) {
  const { error: authError, staff } = await requireFounderInHandler();
  if (authError) return authError;

  const { plan } = params;
  if (!isValidPlan(plan)) {
    return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
  }

  let updates: Record<string, unknown>;
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Request body must be a non-empty object' }, { status: 400 });
  }

  // Validate before forwarding — reject impossible values
  const validation = validatePlanUpdates(plan, updates);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 422 }
    );
  }

  try {
    const res = await terminalAdminFetch(
      profilePath(plan),
      { method: 'PUT', body: JSON.stringify(updates) },
      staff!.id,
    );

    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    console.error(`[risk-rules/${plan}] PUT error:`, err.message);
    return NextResponse.json(
      { error: { code: 'TERMINAL_ERROR', message: err.message } },
      { status: 502 }
    );
  }
}