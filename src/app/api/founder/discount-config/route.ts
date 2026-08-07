export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

const PLAN_TYPES = ['flash', 'instant', '1step', '2step'] as const;

/**
 * GET /api/founder/discount-config
 * Fetch current per-plan discount codes.
 * Founder access required.
 */
export async function GET() {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
        { status: 403 },
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('discount_config')
      .select('*')
      .order('plan_type');

    if (error) {
      return NextResponse.json({ error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('discount-config GET error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

const updateSchema = z.object({
  updates: z.array(
    z.object({
      planType: z.enum(['flash', 'instant', '1step', '2step']),
      code: z.string().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric'),
      discountPct: z.number().int().min(1).max(99),
      active: z.boolean(),
    }),
  ).min(1),
});

/**
 * PUT /api/founder/discount-config
 * Upsert discount codes for one or more plans.
 * Founder access required.
 */
export async function PUT(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor || !actor.isFullAccess) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const upsertRows = parsed.data.updates.map((u) => ({
      plan_type: u.planType,
      code: u.code.toUpperCase(),
      discount_pct: u.discountPct,
      active: u.active,
      updated_by: actor.id,
      updated_at: now,
    }));

    const { error } = await supabase
      .from('discount_config')
      .upsert(upsertRows, { onConflict: 'plan_type' });

    if (error) {
      return NextResponse.json({ error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
    }

    await auditLogger.log({
      actorId: actor.id,
      actorRole: 'Founder',
      action: 'discount_config.update',
      targetEntityType: 'discount_config',
      targetEntityId: 'all',
      newState: { updates: parsed.data.updates } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ success: true, updated: upsertRows.length });
  } catch (err) {
    console.error('discount-config PUT error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
