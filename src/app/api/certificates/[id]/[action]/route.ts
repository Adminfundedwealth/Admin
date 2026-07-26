export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';
import { auditLogger } from '@/lib/audit/logger';
import { notificationEngine } from '@/lib/notifications/engine';

const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.MAINSITE_API_URL || '';
const BACKEND_API_SECRET = process.env.BACKEND_API_SECRET || process.env.INTERNAL_WEBHOOK_SECRET || '';

const VALID_ACTIONS = ['regenerate', 'download', 'resend', 'delete', 'verify'] as const;
type CertAction = (typeof VALID_ACTIONS)[number];

/**
 * POST /api/certificates/[id]/[action]
 *
 * Actions (all proxy to backend engine):
 *   regenerate – re-trigger PDF generation (moves status back to pending → generated)
 *   download   – record a download event; returns the signed download URL
 *   resend     – ask backend to re-send the certificate email to the trader
 *   delete     – soft-delete / remove certificate (requires certificates.manage)
 *   verify     – trigger backend verification check; returns verification status
 *
 * Admin NEVER generates certificates locally. All side effects live in the backend.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } },
) {
  try {
    const action = params.action as CertAction;

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
        { status: 400 },
      );
    }

    // delete requires manage; all others require view
    const requiredPermission =
      action === 'delete' ? 'certificates.manage' : 'certificates.view';

    const { staff, error: authError } = await requirePermissionInHandler(requiredPermission);
    if (authError) return authError;

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Fetch current certificate
    const { data: cert, error: fetchErr } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchErr || !cert) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Certificate not found' } },
        { status: 404 },
      );
    }

    const previousState = { status: cert.status };
    let updatePayload: Record<string, unknown> = { updated_at: now };
    let backendPath: string | null = null;

    // ── Determine local state update + backend path ───────────────────────────
    switch (action) {
      case 'regenerate':
        if (!['failed', 'generated', 'downloaded'].includes(cert.status)) {
          return NextResponse.json(
            { error: { code: 'INVALID_STATE', message: `Cannot regenerate a certificate in status: ${cert.status}` } },
            { status: 422 },
          );
        }
        updatePayload.status = 'pending';
        updatePayload.failure_reason = null;
        updatePayload.generated_at = null;
        backendPath = `/api/certificates/${params.id}/regenerate`;
        break;

      case 'download':
        updatePayload.downloaded_at = now;
        if (cert.status === 'generated') updatePayload.status = 'downloaded';
        backendPath = null; // fire-and-forget — no backend call required
        break;

      case 'resend':
        updatePayload.email_sent_at = now;
        backendPath = `/api/certificates/${params.id}/resend`;
        break;

      case 'delete':
        backendPath = `/api/certificates/${params.id}/delete`;
        break;

      case 'verify':
        backendPath = `/api/certificates/${params.id}/verify`;
        break;
    }

    // ── Call backend if required ──────────────────────────────────────────────
    let backendData: Record<string, unknown> | null = null;

    if (backendPath && BACKEND_API_URL) {
      try {
        const backendRes = await fetch(`${BACKEND_API_URL}${backendPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': BACKEND_API_SECRET,
          },
          signal: AbortSignal.timeout(20_000),
        });

        if (!backendRes.ok) {
          const errBody = await backendRes.json().catch(() => ({}));
          return NextResponse.json(
            {
              error: {
                code: 'BACKEND_ERROR',
                message: (errBody as any)?.error?.message || `Backend returned ${backendRes.status}`,
              },
            },
            { status: 502 },
          );
        }

        backendData = await backendRes.json();
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Backend unreachable';
        return NextResponse.json(
          { error: { code: 'BACKEND_UNREACHABLE', message: msg } },
          { status: 502 },
        );
      }
    }

    // ── Apply backend response to local state ─────────────────────────────────
    if (backendData) {
      const r = (backendData as any).data;

      switch (action) {
        case 'regenerate':
          if (r?.status) updatePayload.status = r.status;
          if (r?.download_url) updatePayload.download_url = r.download_url;
          if (r?.preview_url) updatePayload.preview_url = r.preview_url;
          if (r?.verification_url) updatePayload.verification_url = r.verification_url;
          if (r?.certificate_number) updatePayload.certificate_number = r.certificate_number;
          if (r?.generated_at) updatePayload.generated_at = r.generated_at;
          // Ensure status is at least generated if backend didn't return one
          if (!r?.status) updatePayload.status = 'generated';
          break;

        case 'verify':
          updatePayload.status = r?.verified ? 'verified' : cert.status;
          if (r?.verified_at) updatePayload.verified_at = r.verified_at;
          else if (r?.verified) updatePayload.verified_at = now;
          break;

        case 'delete':
          // Soft-delete: mark status with a special sentinel or physically remove
          await supabase.from('certificates').delete().eq('id', params.id);
          auditLogger.log({
            actorId: staff?.id ?? 'system',
            actorRole: staff?.roles?.[0] ?? 'staff',
            action: 'certificate.delete',
            targetEntityType: 'certificate',
            targetEntityId: params.id,
            previousState,
            newState: { deleted: true },
            ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
            deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
          }).catch(() => {});
          return NextResponse.json({ data: { id: params.id, action: 'deleted' } });
      }
    }

    // ── Persist local update ──────────────────────────────────────────────────
    const { data: updated, error: updateErr } = await supabase
      .from('certificates')
      .update(updatePayload)
      .eq('id', params.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: { code: 'UPDATE_ERROR', message: updateErr.message } },
        { status: 500 },
      );
    }

    // ── Audit + Notification ──────────────────────────────────────────────────
    auditLogger.log({
      actorId: staff?.id ?? 'system',
      actorRole: staff?.roles?.[0] ?? 'staff',
      action: `certificate.${action}`,
      targetEntityType: 'certificate',
      targetEntityId: params.id,
      previousState,
      newState: updatePayload,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: { userAgent: request.headers.get('user-agent') || '' } as any,
    }).catch(() => {});

    if (action === 'regenerate' || action === 'resend') {
      notificationEngine.broadcast({
        permission: 'certificates.view',
        priority: 'low',
        title: action === 'regenerate' ? 'Certificate Regenerated' : 'Certificate Resent',
        message: `Certificate ${cert.certificate_number || params.id.slice(0, 8)} ${action === 'regenerate' ? 'regenerated' : 'email resent'}`,
        eventSource: 'admin.certificate',
        linkTo: `/certificates/${params.id}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      data: {
        ...(updated || cert),
        action,
        // Attach the signed download URL when action = download
        ...(action === 'download' && cert.download_url
          ? { download_url: cert.download_url }
          : {}),
      },
    });
  } catch (err) {
    console.error(`[certificates/[id]/[action]] ${params.action} error:`, err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Action failed' } },
      { status: 500 },
    );
  }
}
