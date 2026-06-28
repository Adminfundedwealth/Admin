export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { auditLogger } from '@/lib/audit/logger';
import { z } from 'zod';

const refundSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  amount: z.number().positive().optional(), // If not provided, full refund
});

/**
 * POST /api/payments/[id]/refund
 * Initiate a refund for a payment (order).
 * Reads: orders
 * Writes: orders (status → refunded), refund_records, audit_records
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getAuthenticatedStaff();
    if (!actor) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    // Check permission
    if (!actor.isFullAccess && !actor.permissions.includes('payments.refund')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, { status: 403 });
    }

    const body = await request.json();
    const parsed = refundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orderId = params.id;

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Order not found' } }, { status: 404 });
    }

    // Validate order can be refunded
    if (['refunded', 'failed'].includes(order.status)) {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: `Order is already ${order.status}` } }, { status: 400 });
    }

    const refundAmount = parsed.data.amount || order.amount;

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: { code: 'UPDATE_ERROR', message: updateError.message } }, { status: 500 });
    }

    // Create refund record
    await supabase.from('refund_records').insert({
      order_id: orderId,
      user_id: order.user_id,
      amount: refundAmount,
      reason: parsed.data.reason,
      processed_by: actor.id,
      status: 'processed',
      created_at: new Date().toISOString(),
    });

    // Audit log
    await auditLogger.log({
      actorId: actor.id,
      actorRole: actor.roles[0] || 'staff',
      action: 'payment.refund',
      targetEntityType: 'order',
      targetEntityId: orderId,
      previousState: { status: order.status, amount: order.amount } as any,
      newState: { status: 'refunded', refundAmount, reason: parsed.data.reason } as any,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    });

    return NextResponse.json({
      success: true,
      orderId,
      refundAmount,
      message: 'Refund processed successfully',
    });
  } catch (err) {
    console.error('Refund error:', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to process refund' } }, { status: 500 });
  }
}
