import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';

export const dynamic = 'force-dynamic';

const PLAN_TYPES = ['flash', 'instant', '1step', '2step'] as const;
const previewSchema = z.object({
  rules: z.array(z.object({
    planType: z.enum(PLAN_TYPES),
    discountPct: z.number().int().min(1).max(99),
  })).max(PLAN_TYPES.length),
});

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedStaff();
  if (!actor || !actor.isFullAccess) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid pricing preview' } },
      { status: 400 },
    );
  }
  if (new Set(parsed.data.rules.map((rule) => rule.planType)).size !== parsed.data.rules.length) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'A plan can only have one discount percentage in a campaign.' } },
      { status: 400 },
    );
  }

  const apiBase = (process.env.MAINSITE_API_URL || 'https://api.fundedwealth.com').replace(/\/+$/, '');
  try {
    const response = await fetch(`${apiBase}/api/discount-config/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
      console.error('Main-site campaign price preview failed:', { status: response.status });
      return NextResponse.json(
        { error: { code: 'PRICING_PREVIEW_UNAVAILABLE', message: 'The product catalog pricing preview is unavailable.' } },
        { status: 503 },
      );
    }

    return NextResponse.json({ data: (payload as { data: unknown[] }).data });
  } catch (error) {
    console.error('Main-site campaign price preview request failed:', error);
    return NextResponse.json(
      { error: { code: 'PRICING_PREVIEW_UNAVAILABLE', message: 'The product catalog pricing preview is unavailable.' } },
      { status: 503 },
    );
  }
}
