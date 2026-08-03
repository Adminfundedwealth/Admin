export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { notificationEngine } from '@/lib/notifications/engine';
import { notifyCertificateIssued } from '@/lib/webhooks/outgoing';
import { z } from 'zod';

const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.MAINSITE_API_URL || '';
const BACKEND_API_SECRET = process.env.BACKEND_API_SECRET || process.env.INTERNAL_WEBHOOK_SECRET || '';

/**
 * GET /api/certificates
 * List certificates with filtering, pagination, and aggregate analytics.
 * Admin reads certificate records — does NOT generate them here.
 *
 * Query params:
 *   status        – pending | generated | downloaded | verified | failed
 *   user_id       – filter by trader
 *   payout_id     – filter by payout
 *   certificate_type – profit_certificate | funded_trader | phase_completion
 *   date_from     – ISO date string
 *   date_to       – ISO date string
 *   page          – 1-based page index (default: 1)
 *   page_size     – records per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requirePermissionInHandler('certificates.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;

    const status = params.get('status');
    const userId = params.get('user_id');
    const payoutId = params.get('payout_id');
    const certType = params.get('certificate_type');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(params.get('page_size') || '20', 10)));
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('certificates')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (userId) query = query.eq('user_id', userId);
    if (payoutId) query = query.eq('payout_id', payoutId);
    if (certType) query = query.eq('certificate_type', certType);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    // Analytics — aggregate across full (unfiltered) dataset
    const { data: allCerts } = await supabase
      .from('certificates')
      .select('status');

    const statusCounts = { pending: 0, generated: 0, downloaded: 0, verified: 0, failed: 0 };
    for (const cert of allCerts || []) {
      const s = cert.status as keyof typeof statusCounts;
      if (s in statusCounts) statusCounts[s]++;
    }

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        pageSize,
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
      analytics: {
        total: (allCerts || []).length,
        ...statusCounts,
      },
    });
  } catch (err) {
    console.error('[certificates] GET error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch certificates' } },
      { status: 500 },
    );
  }
}

const generateSchema = z.object({
  user_id: z.string().uuid(),
  payout_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  certificate_type: z.enum(['profit_certificate', 'funded_trader', 'phase_completion']),
  amount: z.number().positive().optional(),
});

/**
 * POST /api/certificates/generate
 * Proxy a certificate generation request to the backend Certificate Engine.
 * Admin triggers — backend generates — Admin stores result reference.
 *
 * Flow:
 *   1. Validate payload
 *   2. POST to BACKEND_API_URL/certificates/generate
 *   3. Upsert result into local `certificates` table
 *   4. Audit log
 *   5. Broadcast notification to staff with certificates.view
 */
export async function POST(request: NextRequest) {
  try {
    const { staff, error: authError } = await requirePermissionInHandler('certificates.manage');
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // ── 1. Insert a pending placeholder so we can track the request ──────────
    const { data: placeholder, error: insertErr } = await supabase
      .from('certificates')
      .insert({
        user_id: parsed.data.user_id,
        payout_id: parsed.data.payout_id ?? null,
        account_id: parsed.data.account_id ?? null,
        certificate_type: parsed.data.certificate_type,
        amount: parsed.data.amount ?? null,
        status: 'pending',
        issued_by: staff?.id ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertErr || !placeholder) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: insertErr?.message || 'Failed to create certificate record' } },
        { status: 500 },
      );
    }

    // ── 2. Forward request to the backend Certificate Engine ─────────────────
    let backendResult: Record<string, unknown> | null = null;

    if (BACKEND_API_URL) {
      try {
        const backendRes = await fetch(`${BACKEND_API_URL}/api/certificates/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': BACKEND_API_SECRET,
            'x-certificate-id': placeholder.id,
          },
          body: JSON.stringify({
            certificate_id: placeholder.id,
            ...parsed.data,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (backendRes.ok) {
          backendResult = await backendRes.json();
        } else {
          const errBody = await backendRes.json().catch(() => ({}));
          // Update placeholder to failed
          await supabase
            .from('certificates')
            .update({
              status: 'failed',
              failure_reason: (errBody as any)?.error?.message || `Backend returned ${backendRes.status}`,
              updated_at: now,
            })
            .eq('id', placeholder.id);

          return NextResponse.json(
            {
              error: {
                code: 'BACKEND_ERROR',
                message: (errBody as any)?.error?.message || 'Certificate engine returned an error',
              },
            },
            { status: 502 },
          );
        }
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Backend unreachable';
        await supabase
          .from('certificates')
          .update({ status: 'failed', failure_reason: msg, updated_at: now })
          .eq('id', placeholder.id);

        return NextResponse.json(
          { error: { code: 'BACKEND_UNREACHABLE', message: msg } },
          { status: 502 },
        );
      }
    }

    // ── 3. Update certificate record with backend response ───────────────────
    const certUpdate: Record<string, unknown> = {
      status: 'generated',
      generated_at: now,
      updated_at: now,
    };

    if (backendResult) {
      const r = backendResult as any;
      if (r.data?.download_url) certUpdate.download_url = r.data.download_url;
      if (r.data?.preview_url) certUpdate.preview_url = r.data.preview_url;
      if (r.data?.verification_url) certUpdate.verification_url = r.data.verification_url;
      if (r.data?.certificate_number) certUpdate.certificate_number = r.data.certificate_number;
    }

    const { data: updatedCert } = await supabase
      .from('certificates')
      .update(certUpdate)
      .eq('id', placeholder.id)
      .select()
      .single();

    // ── 4. Audit log ─────────────────────────────────────────────────────────
    auditLogger.log({
      actorId: staff?.id ?? 'system',
      actorRole: staff?.roles?.[0] ?? 'staff',
      action: 'certificate.generate',
      targetEntityType: 'certificate',
      targetEntityId: placeholder.id,
      previousState: { status: 'pending' },
      newState: certUpdate,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    }).catch(() => {});

    // ── 5. Notify staff ───────────────────────────────────────────────────────
    notificationEngine.broadcast({
      permission: 'certificates.view',
      priority: 'low',
      title: 'Certificate Generated',
      message: `${parsed.data.certificate_type.replace(/_/g, ' ')} certificate issued for user ${parsed.data.user_id.slice(0, 8)}`,
      eventSource: 'admin.certificate',
      linkTo: `/certificates/${placeholder.id}`,
    }).catch(() => {});

    // ── 6. Notify Main Site via outgoing webhook ──────────────────────────────
    // Main Site uses this to update the trader dashboard, show certificate badge,
    // and display the verification link on the trader's profile.
    const finalCert = updatedCert || placeholder;
    notifyCertificateIssued(placeholder.id, parsed.data.user_id, {
      payout_id:          parsed.data.payout_id ?? null,
      certificate_type:   parsed.data.certificate_type,
      certificate_number: (finalCert as any).certificate_number ?? null,
      amount:             parsed.data.amount ?? null,
      download_url:       (certUpdate.download_url as string) ?? null,
      verification_url:   (certUpdate.verification_url as string) ?? null,
    }).catch(() => {});

    return NextResponse.json(
      { data: updatedCert || placeholder },
      { status: 201 },
    );
  } catch (err) {
    console.error('[certificates] POST error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate certificate' } },
      { status: 500 },
    );
  }
}
