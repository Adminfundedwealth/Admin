export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { MainSiteError, reviewManualPayment } from '@/lib/provisioning/mainsite-provision';

const reviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), verifiedCredit: z.literal(true) }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(10).max(500),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { staff, error: authError } = await requirePermissionInHandler('payments.manage');
    if (authError) return authError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'A valid JSON request body is required.' } },
        { status: 400 },
      );
    }

    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const orderId = params.id;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, amount, status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      console.error('[payments/review] failed to load order:', orderError);
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: 'Could not load the order for review.' } },
        { status: 500 },
      );
    }
    if (!order) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Order not found.' } },
        { status: 404 },
      );
    }
    if (order.status !== 'pending_review') {
      return NextResponse.json(
        { error: { code: 'INVALID_STATE', message: 'This order is no longer awaiting payment review.' } },
        { status: 409 },
      );
    }

    const { data: manualPayment, error: manualError } = await supabase
      .from('manual_payments')
      .select('id, order_id, user_id, amount, status')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (manualError) {
      console.error('[payments/review] failed to load manual payment:', manualError);
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: 'Could not load the submitted payment for review.' } },
        { status: 500 },
      );
    }
    if (!manualPayment) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No manual payment is linked to this order.' } },
        { status: 404 },
      );
    }
    if (
      manualPayment.status !== 'pending' ||
      String(manualPayment.user_id) !== String(order.user_id) ||
      Number(manualPayment.amount) !== Number(order.amount)
    ) {
      return NextResponse.json(
        { error: { code: 'INVALID_STATE', message: 'The payment record does not match the pending order.' } },
        { status: 409 },
      );
    }

    const action = parsed.data.action;
    const result = await reviewManualPayment({
      paymentId: Number(manualPayment.id),
      action,
      rejectionReason: action === 'reject' ? parsed.data.reason : undefined,
    });

    await auditLogger.log({
      actorId: staff.id,
      actorRole: staff.roles[0] ?? 'staff',
      action: action === 'approve' ? 'payment.manual.approved' : 'payment.manual.rejected',
      targetEntityType: 'manual_payments',
      targetEntityId: String(manualPayment.id),
      previousState: { status: manualPayment.status },
      newState: {
        status: action === 'approve' ? 'approved' : 'rejected',
        order_id: orderId,
        ...(action === 'reject' ? { reason: parsed.data.reason } : {}),
      },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1',
      deviceInfo: {
        fingerprint: request.headers.get('x-device-fingerprint') ?? 'payments-review',
        browser: request.headers.get('user-agent') ?? 'unknown',
        os: 'server',
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1',
      },
      metadata: { order_id: orderId },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof MainSiteError) {
      return NextResponse.json(
        { error: { code: 'PAYMENT_REVIEW_FAILED', message: error.message } },
        { status: error.status },
      );
    }
    console.error('[payments/review] error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to review manual payment.' } },
      { status: 500 },
    );
  }
}
