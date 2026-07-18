export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

/**
 * GET /api/coupons
 * List all coupons.
 * Reads: coupons
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('coupons')
      .select('*', { count: 'exact' });

    if (status === 'active') {
      query = query.eq('active', true);
    } else if (status === 'inactive') {
      query = query.eq('active', false);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      // If table doesn't exist, return empty
      return NextResponse.json({ data: [], meta: { page, pageSize, totalCount: 0, totalPages: 0 } });
    }

    return NextResponse.json({
      data: data || [],
      meta: { page, pageSize, totalCount: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    });
  } catch (err) {
    console.error('Coupons fetch error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

const createCouponSchema = z.object({
  code: z.string().min(3).max(30).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric (uppercase)'),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive(),
  max_uses: z.number().int().positive().optional(),
  expires_at: z.string().optional(),
  applicable_plans: z.array(z.string()).optional(),
  min_order_amount: z.number().positive().optional(),
  description: z.string().optional(),
});

/**
 * POST /api/coupons
 * Create a new coupon.
 * Writes: coupons, audit_records
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    if (!actor.isFullAccess && !actor.permissions.includes('marketing.manage')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check for duplicate code
    const { data: existing } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', parsed.data.code.toUpperCase())
      .single();

    if (existing) {
      return NextResponse.json({ error: { code: 'DUPLICATE', message: 'Coupon code already exists' } }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        code: parsed.data.code.toUpperCase(),
        discount_type: parsed.data.discount_type,
        discount_value: parsed.data.discount_value,
        max_uses: parsed.data.max_uses || null,
        uses_count: 0,
        expires_at: parsed.data.expires_at || null,
        applicable_plans: parsed.data.applicable_plans || null,
        min_order_amount: parsed.data.min_order_amount || null,
        description: parsed.data.description || null,
        active: true,
        created_by: actor.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: { code: 'INSERT_ERROR', message: error.message } }, { status: 500 });
    }

    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'staff',
      action: 'coupon.create',
      targetEntityType: 'coupon',
      targetEntityId: data.id,
      newState: parsed.data as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Coupon create error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}

/**
 * PATCH /api/coupons
 * Toggle coupon active status or update.
 * Writes: coupons, audit_records
 */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const body = await request.json();
    const { id, active } = body;

    if (!id) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'id required' } }, { status: 400 });
    }

    const supabase = createAdminClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof active === 'boolean') updates.active = active;

    const { error } = await supabase
      .from('coupons')
      .update(updates)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: { code: 'UPDATE_ERROR', message: error.message } }, { status: 500 });
    }

    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'staff',
      action: `coupon.${active ? 'activate' : 'deactivate'}`,
      targetEntityType: 'coupon',
      targetEntityId: id,
      newState: { active } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Coupon update error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed' } }, { status: 500 });
  }
}
