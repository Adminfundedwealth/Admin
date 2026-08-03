'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timeline, type TimelineEvent } from '@/components/shared/timeline';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { CertificatePreviewModal } from '@/components/certificates/certificate-preview-modal';
import { formatCurrency } from '@/lib/utils';
import type { Certificate } from '@/types/database';
import {
  CheckCircle, XCircle, RotateCcw, Award, Download, RefreshCw,
  ExternalLink, AlertCircle, Clock, FileCheck, CheckCircle2,
} from 'lucide-react';

interface PayoutDetail {
  id: string;
  user_id: string;
  funded_account_id: string;
  requested_amount: number;
  profit_share_pct: number;
  calculated_payout: number;
  account_pnl_since_last_payout: number | null;
  status: string;
  eligibility_status: string;
  eligibility_reason: string | null;
  payment_method: string | null;
  transaction_reference: string | null;
  rejection_reason: string | null;
  failure_reason: string | null;
  reviewer_id: string | null;
  approver_id: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ─── Certificate status badge (inline, no external dep) ──────────────────────

const CERT_STATUS_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending:    { label: 'Pending',    cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',     Icon: Clock },
  generated:  { label: 'Generated',  cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',             Icon: FileCheck },
  downloaded: { label: 'Downloaded', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',     Icon: Download },
  verified:   { label: 'Verified',   cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', Icon: CheckCircle2 },
  failed:     { label: 'Failed',     cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',                 Icon: AlertCircle },
};

function CertStatusBadge({ status }: { status: string }) {
  const meta = CERT_STATUS_META[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', Icon: Award };
  const { label, cls, Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

const WORKFLOW_STEPS = ['request_received', 'under_review', 'approved', 'payment_processing', 'payment_completed'];

export default function PayoutDetailPage() {
  const params = useParams();
  const payoutId = params.payoutId as string;
  const [payout, setPayout] = useState<PayoutDetail | null>(null);
  const [history, setHistory] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | 'retry' | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // ── Certificate state ──────────────────────────────────────────────────────
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState('');
  const [certActionLoading, setCertActionLoading] = useState<string | null>(null);
  const [certPreviewOpen, setCertPreviewOpen] = useState(false);

  useEffect(() => { fetchPayout(); }, [payoutId]);

  async function fetchPayout() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/payouts/${payoutId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setPayout(json.data.payout);
      setHistory(json.data.history || []);
    } catch { setError('Failed to load payout details.'); }
    finally { setLoading(false); }
  }

  // Fetch the certificate linked to this payout (if any)
  async function fetchCertificate() {
    setCertLoading(true);
    setCertError('');
    try {
      const res = await apiFetch(`/api/certificates?payout_id=${payoutId}&page_size=1`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setCertificate((json.data || [])[0] ?? null);
    } catch {
      setCertError('Failed to load certificate.');
    } finally {
      setCertLoading(false);
    }
  }

  useEffect(() => {
    if (payoutId) fetchCertificate();
  }, [payoutId]);

  async function handleAction() {
    if (!actionModal || !payout) return;
    if (actionModal === 'reject' && (reason.length < 10 || reason.length > 1000)) {
      setActionError('Rejection reason must be 10-1000 characters.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await apiFetch(`/api/payouts/${payoutId}/${actionModal}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error?.message || 'Action failed');
        return;
      }

      // ── After approve: trigger certificate generation ──────────────────────
      if (actionModal === 'approve' && payout) {
        try {
          await apiFetch('/api/certificates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: payout.user_id,
              payout_id: payoutId,
              account_id: payout.funded_account_id,
              certificate_type: 'profit_certificate',
              amount: payout.calculated_payout,
            }),
          });
          // Refresh certificate section to show the newly created record
          fetchCertificate();
        } catch {
          // Certificate generation is non-blocking — payout approval still succeeded
          console.warn('Certificate generation triggered but fetch failed (non-fatal)');
        }
      }

      setActionModal(null);
      setReason('');
      fetchPayout();
    } catch { setActionError('Action failed.'); }
    finally { setActionLoading(false); }
  }

  async function handleCertAction(action: string) {
    if (!certificate) return;
    setCertActionLoading(action);
    try {
      if (action === 'download' && certificate.download_url) {
        await apiFetch(`/api/certificates/${certificate.id}/download`, { method: 'POST' });
        window.open(certificate.download_url, '_blank', 'noopener,noreferrer');
        fetchCertificate();
        return;
      }
      const res = await apiFetch(`/api/certificates/${certificate.id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setCertError(data.error?.message || `${action} failed`);
        return;
      }
      fetchCertificate();
    } finally {
      setCertActionLoading(null);
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchPayout} />;
  if (!payout) return <ErrorState message="Payout not found" />;

  const currentStepIndex = WORKFLOW_STEPS.indexOf(payout.status);
  const canApprove = payout.status === 'under_review';
  const canReject = payout.status === 'request_received' || payout.status === 'under_review';
  const canRetry = payout.status === 'payment_failed';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payout Request</h1>
          <p className="text-muted-foreground">ID: {payout.id.slice(0, 12)}... • {formatCurrency(payout.requested_amount)}</p>
        </div>
        <div className="flex gap-2">
          {canApprove && <Button size="sm" className="gap-1.5" onClick={() => setActionModal('approve')}><CheckCircle className="h-3.5 w-3.5" /> Approve</Button>}
          {canReject && <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setActionModal('reject')}><XCircle className="h-3.5 w-3.5" /> Reject</Button>}
          {canRetry && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActionModal('retry')}><RotateCcw className="h-3.5 w-3.5" /> Retry Payment</Button>}
        </div>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader><CardTitle className="text-base">Workflow Status</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            {WORKFLOW_STEPS.map((step, i) => {
              const isComplete = i < currentStepIndex;
              const isCurrent = step === payout.status;
              const isFailed = payout.status === 'payment_failed' && step === 'payment_processing';
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold shrink-0 ${
                    isFailed ? 'bg-red-500 text-white' :
                    isComplete ? 'bg-green-500 text-white' :
                    isCurrent ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isComplete ? '✓' : i + 1}
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${isComplete ? 'bg-green-500' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex mt-2">
            {WORKFLOW_STEPS.map((step) => (
              <div key={step} className="flex-1 text-[10px] text-center text-muted-foreground">
                {step.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payout Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Request Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Requested Amount</span><span className="font-medium">{formatCurrency(payout.requested_amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit Share</span><span>{payout.profit_share_pct}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Calculated Payout</span><span className="font-medium">{formatCurrency(payout.calculated_payout)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">P&L Since Last Payout</span><span>{payout.account_pnl_since_last_payout ? formatCurrency(payout.account_pnl_since_last_payout) : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Eligibility</span><span className={payout.eligibility_status === 'eligible' ? 'text-green-600' : 'text-red-500'}>{payout.eligibility_status}</span></div>
            {payout.eligibility_reason && <div className="flex justify-between"><span className="text-muted-foreground">Reason</span><span>{payout.eligibility_reason}</span></div>}
            {payout.payment_method && <div className="flex justify-between"><span className="text-muted-foreground">Payment Method</span><span>{payout.payment_method}</span></div>}
            {payout.transaction_reference && <div className="flex justify-between"><span className="text-muted-foreground">Transaction Ref</span><span className="font-mono text-xs">{payout.transaction_reference}</span></div>}
            {payout.rejection_reason && <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs"><strong>Rejection:</strong> {payout.rejection_reason}</div>}
            {payout.failure_reason && <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs"><strong>Failure:</strong> {payout.failure_reason}</div>}
          </CardContent>
        </Card>

        {/* Status History */}
        <Card>
          <CardHeader><CardTitle className="text-base">Status History</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No history yet.</p>
            ) : (
              <Timeline events={history} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Certificate Section ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Profit Certificate
          </CardTitle>
          {!certLoading && !certificate && payout?.status === 'approved' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7"
              onClick={async () => {
                if (!payout) return;
                setCertLoading(true);
                try {
                  await apiFetch('/api/certificates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      user_id: payout.user_id,
                      payout_id: payoutId,
                      account_id: payout.funded_account_id,
                      certificate_type: 'profit_certificate',
                      amount: payout.calculated_payout,
                    }),
                  });
                  fetchCertificate();
                } catch {
                  setCertError('Failed to generate certificate.');
                } finally {
                  setCertLoading(false);
                }
              }}
            >
              <Award className="h-3 w-3" />
              Generate
            </Button>
          )}
          {certificate && (
            <Link
              href={`/certificates/${certificate.id}`}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View full details
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {certLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading certificate…
            </div>
          ) : certError ? (
            <p className="text-sm text-destructive">{certError}</p>
          ) : !certificate ? (
            <div className="flex items-center gap-3 py-2">
              <div className="p-2 rounded-full bg-muted">
                <Award className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">No certificate yet</p>
                <p className="text-xs text-muted-foreground">
                  {payout?.status === 'approved'
                    ? 'Click Generate to issue a profit certificate for this payout.'
                    : 'Certificate will be generated automatically upon payout approval.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Status row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CertStatusBadge status={certificate.status} />
                  {certificate.certificate_number && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {certificate.certificate_number}
                    </span>
                  )}
                </div>
                {certificate.generated_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(certificate.generated_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Failure reason */}
              {certificate.failure_reason && (
                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2.5 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {certificate.failure_reason}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {(certificate.preview_url || certificate.download_url) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => setCertPreviewOpen(true)}
                  >
                    <Award className="h-3 w-3" />
                    Preview
                  </Button>
                )}
                {certificate.download_url && (
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => handleCertAction('download')}
                    disabled={certActionLoading === 'download'}
                  >
                    {certActionLoading === 'download'
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                    Download
                  </Button>
                )}
                {['failed', 'generated', 'downloaded'].includes(certificate.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => handleCertAction('regenerate')}
                    disabled={certActionLoading === 'regenerate'}
                  >
                    {certActionLoading === 'regenerate'
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                    Regenerate
                  </Button>
                )}
                {certificate.verification_url && (
                  <a
                    href={certificate.verification_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border text-xs font-medium hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Verification Link
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certificate preview modal */}
      {certPreviewOpen && certificate && (
        <CertificatePreviewModal
          cert={certificate}
          onClose={() => setCertPreviewOpen(false)}
          onAction={async (action) => {
            await handleCertAction(action);
            setCertPreviewOpen(false);
          }}
        />
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setActionModal(null); setReason(''); setActionError(''); }} />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold capitalize">{actionModal} Payout</h3>
            {actionModal === 'reject' ? (
              <>
                <p className="text-sm text-muted-foreground">Provide a rejection reason (10-1000 characters). The trader will be notified.</p>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason..." className="w-full min-h-[100px] rounded border bg-background px-3 py-2 text-sm" maxLength={1000} />
                <p className="text-xs text-muted-foreground">{reason.length}/1000 characters</p>
              </>
            ) : actionModal === 'approve' ? (
              <p className="text-sm text-muted-foreground">
                Confirm approval of this payout for {formatCurrency(payout.calculated_payout)}.
                This will be recorded in the audit trail and a profit certificate will be
                automatically generated for the trader.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Retry the failed payment for {formatCurrency(payout.calculated_payout)}.</p>
            )}
            {actionError && <div className="text-sm text-destructive">{actionError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setActionModal(null); setReason(''); setActionError(''); }}>Cancel</Button>
              <Button
                variant={actionModal === 'reject' ? 'destructive' : 'default'}
                onClick={handleAction}
                disabled={actionLoading || (actionModal === 'reject' && (reason.length < 10 || reason.length > 1000))}
              >
                {actionLoading ? 'Processing...' : `Confirm ${actionModal}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
