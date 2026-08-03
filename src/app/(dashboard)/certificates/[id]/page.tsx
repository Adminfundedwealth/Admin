'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { CertificatePreviewModal } from '@/components/certificates/certificate-preview-modal';
import type { Certificate } from '@/types/database';
import {
  Award, Download, RefreshCw, Send, Trash2, ShieldCheck,
  ArrowLeft, ExternalLink, CheckCircle2, Clock, AlertCircle,
  FileCheck, Copy, Check,
} from 'lucide-react';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  generated:  { label: 'Generated',  cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  downloaded: { label: 'Downloaded', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  verified:   { label: 'Verified',   cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  failed:     { label: 'Failed',     cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={copy}
      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0 min-w-[160px]">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className={`text-sm text-right ${mono ? 'font-mono text-xs' : 'font-medium'} truncate`}>
          {value ?? <span className="text-muted-foreground">—</span>}
        </span>
        {copyable && typeof value === 'string' && value && (
          <CopyButton value={value} />
        )}
      </div>
    </div>
  );
}

// ─── Timeline step ────────────────────────────────────────────────────────────

const WORKFLOW_STEPS: { key: string; label: string }[] = [
  { key: 'pending',    label: 'Requested' },
  { key: 'generated',  label: 'Generated' },
  { key: 'downloaded', label: 'Downloaded' },
  { key: 'verified',   label: 'Verified' },
];

const STATUS_ORDER: Record<string, number> = {
  pending: 0, generated: 1, downloaded: 2, verified: 3, failed: -1,
};

function WorkflowTracker({ cert }: { cert: Certificate }) {
  const currentIdx = STATUS_ORDER[cert.status] ?? 0;
  const isFailed = cert.status === 'failed';

  return (
    <div>
      <div className="flex items-center gap-1">
        {WORKFLOW_STEPS.map((step, i) => {
          const isComplete = !isFailed && i < currentIdx;
          const isCurrent = !isFailed && i === currentIdx;
          const isFailedStep = isFailed && i === 0;
          return (
            <div key={step.key} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold shrink-0 ${
                  isFailedStep  ? 'bg-red-500 text-white' :
                  isComplete    ? 'bg-green-500 text-white' :
                  isCurrent     ? 'bg-primary text-primary-foreground' :
                                  'bg-muted text-muted-foreground'
                }`}
              >
                {isFailedStep ? '!' : isComplete ? '✓' : i + 1}
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 ${isComplete ? 'bg-green-500' : 'bg-muted'}`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex mt-1.5">
        {WORKFLOW_STEPS.map((step) => (
          <div key={step.key} className="flex-1 text-[10px] text-center text-muted-foreground">
            {step.label}
          </div>
        ))}
      </div>
      {isFailed && cert.failure_reason && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {cert.failure_reason}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const certId = params.id as string;

  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { fetchCert(); }, [certId]);

  async function fetchCert() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/certificates/${certId}`);
      if (!res.ok) throw new Error('Not found');
      const json = await res.json();
      setCert(json.data);
    } catch {
      setError('Failed to load certificate.');
    } finally {
      setLoading(false);
    }
  }

  async function callAction(action: string) {
    setActionLoading(action);
    setActionError('');
    try {
      const res = await apiFetch(`/api/certificates/${certId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error?.message || `${action} failed`);
        return;
      }
      if (action === 'delete') {
        router.push('/certificates');
        return;
      }
      fetchCert();
    } catch {
      setActionError(`${action} failed.`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownload() {
    if (!cert) return;
    await callAction('download');
    if (cert.download_url) {
      window.open(cert.download_url, '_blank', 'noopener,noreferrer');
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error || !cert) return <ErrorState message={error || 'Certificate not found'} onRetry={fetchCert} />;

  const canRegenerate = ['failed', 'generated', 'downloaded'].includes(cert.status);
  const canDownload = !!cert.download_url;
  const isActing = (action: string) => actionLoading === action;

  return (
    <div className="space-y-6">

      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/certificates"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Certificate Center
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {cert.certificate_number || cert.id.slice(0, 12) + '…'}
            </h1>
            <StatusBadge status={cert.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {cert.certificate_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            {cert.amount != null && ` · ₹${cert.amount.toLocaleString('en-IN')}`}
          </p>
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {cert.preview_url || cert.download_url ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPreview(true)}>
              <Award className="h-3.5 w-3.5" />
              Preview
            </Button>
          ) : null}

          {canDownload && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleDownload}
              disabled={isActing('download')}
            >
              {isActing('download')
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              Download
            </Button>
          )}

          {canRegenerate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => callAction('regenerate')}
              disabled={isActing('regenerate')}
            >
              {isActing('regenerate')
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => callAction('resend')}
            disabled={isActing('resend')}
          >
            {isActing('resend')
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            Resend Email
          </Button>

          {cert.status !== 'verified' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => callAction('verify')}
              disabled={isActing('verify')}
            >
              {isActing('verify')
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <ShieldCheck className="h-3.5 w-3.5" />}
              Verify
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Workflow tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificate Status</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowTracker cert={cert} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* Core Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certificate Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow label="Certificate ID"        value={cert.id}                 mono copyable />
            <DetailRow label="Certificate Number"    value={cert.certificate_number} mono copyable />
            <DetailRow label="Type"                  value={cert.certificate_type.replace(/_/g, ' ')} />
            <DetailRow label="Status"                value={<StatusBadge status={cert.status} />} />
            <DetailRow label="Amount"                value={cert.amount != null ? `₹${cert.amount.toLocaleString('en-IN')}` : null} />
            <DetailRow label="Trader User ID"        value={cert.user_id}            mono copyable />
            <DetailRow label="Payout ID"             value={cert.payout_id}          mono copyable />
            <DetailRow label="Account ID"            value={cert.account_id}         mono copyable />
            <DetailRow label="Issued By (Staff)"     value={cert.issued_by}          mono />
            {cert.failure_reason && (
              <div className="py-2">
                <p className="text-xs font-medium text-red-600 mb-1">Failure Reason</p>
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-2">
                  {cert.failure_reason}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timestamps + Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline &amp; Links</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow label="Created"    value={new Date(cert.created_at).toLocaleString()} />
            <DetailRow label="Generated"  value={cert.generated_at  ? new Date(cert.generated_at).toLocaleString()  : null} />
            <DetailRow label="Downloaded" value={cert.downloaded_at ? new Date(cert.downloaded_at).toLocaleString() : null} />
            <DetailRow label="Email Sent" value={cert.email_sent_at ? new Date(cert.email_sent_at).toLocaleString() : null} />
            <DetailRow label="Verified"   value={cert.verified_at   ? new Date(cert.verified_at).toLocaleString()   : null} />
            <DetailRow label="Last Updated" value={new Date(cert.updated_at).toLocaleString()} />

            {/* Download URL */}
            {cert.download_url && (
              <div className="py-2 space-y-1">
                <p className="text-sm text-muted-foreground">Download URL</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs truncate flex-1 text-muted-foreground">
                    {cert.download_url.slice(0, 60)}…
                  </span>
                  <CopyButton value={cert.download_url} />
                  <a
                    href={cert.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Open download URL"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Verification URL */}
            {cert.verification_url && (
              <div className="py-2 space-y-1">
                <p className="text-sm text-muted-foreground">Verification Link</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs truncate flex-1 text-muted-foreground">
                    {cert.verification_url.slice(0, 60)}…
                  </span>
                  <CopyButton value={cert.verification_url} />
                  <a
                    href={cert.verification_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Open verification link"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <CertificatePreviewModal
          cert={cert}
          onClose={() => setShowPreview(false)}
          onAction={async (action) => {
            if (action === 'download') await handleDownload();
            else await callAction(action);
            setShowPreview(false);
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setConfirmDelete(false)}
          />
          <div className="relative bg-background p-6 rounded-xl shadow-2xl border w-full max-w-sm space-y-4 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold">Delete Certificate</h3>
                <p className="text-xs text-muted-foreground">This action is permanent and logged.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete certificate{' '}
              <span className="font-mono font-medium">{cert.certificate_number || cert.id.slice(0, 12)}</span>?
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => { setConfirmDelete(false); callAction('delete'); }}
                disabled={isActing('delete')}
                className="gap-1.5"
              >
                {isActing('delete')
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                Delete Certificate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
