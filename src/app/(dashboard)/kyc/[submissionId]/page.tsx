'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timeline, type TimelineEvent } from '@/components/shared/timeline';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { ExternalLink, CheckCircle, XCircle, RotateCcw } from 'lucide-react';

interface KYCDetail {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  status: string;
  document_type: string | null;
  document_front_url: string | null;
  document_back_url: string | null;
  selfie_url: string | null;
  submission_count: number;
  reviewer_id: string | null;
  reviewer_name: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
  overdue: boolean;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function KYCDetailPage() {
  const params = useParams();
  const submissionId = params.submissionId as string;
  const [submission, setSubmission] = useState<KYCDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | 'resubmit' | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => { fetchSubmission(); }, [submissionId]);

  async function fetchSubmission() {
    setLoading(true);
    try {
      const res = await fetch(`/api/kyc/${submissionId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setSubmission(json.data.submission);
      setTimeline(json.data.timeline || []);
    } catch {
      setError('Failed to load KYC submission.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!actionModal || !submission) return;
    if (actionModal !== 'approve' && reason.length < 10) {
      setActionError('Reason must be at least 10 characters.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/kyc/${submissionId}/${actionModal}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error?.message || 'Action failed');
        return;
      }
      setActionModal(null);
      setReason('');
      fetchSubmission();
    } catch {
      setActionError('Action failed.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchSubmission} />;
  if (!submission) return <ErrorState message="KYC submission not found" />;

  const canApprove = ['pending', 'in_review'].includes(submission.status);
  const canReject = ['pending', 'in_review'].includes(submission.status);
  const canRequestResubmit = ['pending', 'in_review'].includes(submission.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">KYC Review</h1>
          <p className="text-muted-foreground">
            Submission #{submission.id.slice(0, 8)} • {submission.user_email}
          </p>
        </div>
        <div className="flex gap-2">
          {canApprove && (
            <Button size="sm" className="gap-1.5" onClick={() => setActionModal('approve')}>
              <CheckCircle className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
          {canRequestResubmit && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActionModal('resubmit')}>
              <RotateCcw className="h-3.5 w-3.5" /> Request Resubmit
            </Button>
          )}
          {canReject && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setActionModal('reject')}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </Button>
          )}
        </div>
      </div>

      {/* Overdue Banner */}
      {submission.overdue && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <h3 className="font-semibold text-red-800 dark:text-red-400">⚠ Overdue Review</h3>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">This submission has exceeded the review SLA.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Submission Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Submission Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{submission.status.replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Document Type</span><span className="capitalize">{submission.document_type || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Attempts</span><span>{submission.submission_count} / 3</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{new Date(submission.created_at).toLocaleString()}</span></div>
              {submission.reviewer_name && <div className="flex justify-between"><span className="text-muted-foreground">Reviewer</span><span>{submission.reviewer_name}</span></div>}
              {submission.reviewed_at && <div className="flex justify-between"><span className="text-muted-foreground">Reviewed</span><span>{new Date(submission.reviewed_at).toLocaleString()}</span></div>}
              {submission.rejection_reason && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs mt-2">
                  <strong>Rejection:</strong> {submission.rejection_reason}
                  {submission.rejection_details && <p className="mt-1">{submission.rejection_details}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Customer</CardTitle>
                <Link href={`/users/${submission.user_id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  Profile <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{submission.user_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{submission.user_email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{submission.user_id}</span></div>
            </CardContent>
          </Card>
        </div>

        {/* Document Viewer */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Document Review</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Front */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Document Front</p>
                  {submission.document_front_url ? (
                    <div className="aspect-[4/3] rounded border bg-muted flex items-center justify-center overflow-hidden">
                      <img src={submission.document_front_url} alt="Document front" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] rounded border bg-muted flex items-center justify-center text-sm text-muted-foreground">No document uploaded</div>
                  )}
                </div>

                {/* Back */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Document Back</p>
                  {submission.document_back_url ? (
                    <div className="aspect-[4/3] rounded border bg-muted flex items-center justify-center overflow-hidden">
                      <img src={submission.document_back_url} alt="Document back" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] rounded border bg-muted flex items-center justify-center text-sm text-muted-foreground">No document uploaded</div>
                  )}
                </div>

                {/* Selfie */}
                {submission.selfie_url && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Selfie / Liveness</p>
                    <div className="aspect-[4/3] rounded border bg-muted flex items-center justify-center overflow-hidden">
                      <img src={submission.selfie_url} alt="Selfie" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-base">Review History</CardTitle></CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No history yet.</p>
              ) : (
                <Timeline events={timeline} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setActionModal(null); setReason(''); setActionError(''); }} />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold capitalize">{actionModal === 'resubmit' ? 'Request Resubmission' : `${actionModal} KYC`}</h3>
            <p className="text-sm text-muted-foreground">
              {actionModal === 'approve'
                ? 'Confirm that the documents are valid and identity is verified.'
                : actionModal === 'reject'
                ? 'Provide a rejection reason (minimum 10 characters). The user will be notified.'
                : 'Explain what documents need to be resubmitted (minimum 10 characters).'}
            </p>
            {actionModal !== 'approve' && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={actionModal === 'reject' ? 'Rejection reason...' : 'What needs to be resubmitted...'}
                className="w-full min-h-[80px] rounded border bg-background px-3 py-2 text-sm"
              />
            )}
            {actionError && <div className="text-sm text-destructive">{actionError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setActionModal(null); setReason(''); setActionError(''); }}>Cancel</Button>
              <Button
                variant={actionModal === 'reject' ? 'destructive' : 'default'}
                onClick={handleAction}
                disabled={actionLoading || (actionModal !== 'approve' && reason.length < 10)}
              >
                {actionLoading ? 'Processing...' : `Confirm`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
