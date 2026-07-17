'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timeline, type TimelineEvent } from '@/components/shared/timeline';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { DeleteArchiveModal } from '@/components/shared/delete-archive-modal';
import { useIsFounder } from '@/hooks/use-is-founder';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import {
  CheckCircle, XCircle, RotateCcw, Clock, ArrowUpCircle,
  Archive, Undo2, ExternalLink, Trash2,
} from 'lucide-react';

interface ChallengeDetail {
  id: string;
  account_number: string;
  user_id: string;
  purchase_order_id: string | null;
  challenge_type: string;
  phase: number;
  status: string;
  initial_balance: number;
  current_balance: number;
  profit_target_pct: number;
  daily_drawdown_limit_pct: number;
  max_drawdown_limit_pct: number;
  min_trading_days: number;
  max_trading_days: number | null;
  trading_days_completed: number;
  profit_pct: number;
  max_daily_drawdown_pct: number;
  max_drawdown_pct: number;
  started_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

// Valid state transitions
const VALID_ACTIONS: Record<string, string[]> = {
  active: ['pass', 'fail', 'extend', 'archive'],
  passed: ['upgrade', 'archive'],
  failed: ['retry', 'reset', 'archive'],
  expired: ['reset', 'archive'],
  archived: ['restore'],
};

const ACTION_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'destructive' | 'outline';
  minReason: number;
}> = {
  pass:    { label: 'Pass',    icon: CheckCircle,   variant: 'default',     minReason: 20 },
  fail:    { label: 'Fail',    icon: XCircle,       variant: 'destructive', minReason: 20 },
  retry:   { label: 'Retry',   icon: RotateCcw,     variant: 'outline',     minReason: 10 },
  reset:   { label: 'Reset',   icon: RotateCcw,     variant: 'outline',     minReason: 10 },
  extend:  { label: 'Extend',  icon: Clock,         variant: 'outline',     minReason: 10 },
  upgrade: { label: 'Upgrade', icon: ArrowUpCircle, variant: 'default',     minReason: 10 },
  archive: { label: 'Archive', icon: Archive,       variant: 'outline',     minReason: 10 },
  restore: { label: 'Restore', icon: Undo2,         variant: 'outline',     minReason: 10 },
};

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const challengeId = params.challengeId as string;
  const { isFounder } = useIsFounder();

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Delete / Archive modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/challenges/${challengeId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setChallenge(json.data.challenge);
      setTimeline(json.data.timeline || []);
    } catch {
      setError('Failed to load challenge details.');
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  async function handleAction() {
    if (!actionModal || !challenge) return;
    const config = ACTION_CONFIG[actionModal];
    if (reason.length < config.minReason) {
      setActionError(`Reason must be at least ${config.minReason} characters.`);
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/challenges/${challengeId}/${actionModal}`, {
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
      fetchChallenge();
    } catch {
      setActionError('Action failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleDeleteSuccess(action: 'archive' | 'permanent_delete') {
    setDeleteModalOpen(false);
    if (action === 'permanent_delete') {
      // Account is gone — navigate back to the list
      router.push('/challenges');
    } else {
      // Refresh to show archived status
      fetchChallenge();
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchChallenge} />;
  if (!challenge) return <ErrorState message="Challenge not found" />;

  const validActions = VALID_ACTIONS[challenge.status] || [];
  const passCriteriaMet =
    challenge.profit_pct >= challenge.profit_target_pct &&
    challenge.max_drawdown_pct <= challenge.max_drawdown_limit_pct &&
    challenge.max_daily_drawdown_pct <= challenge.daily_drawdown_limit_pct &&
    challenge.trading_days_completed >= challenge.min_trading_days;

  const accountLabel = `${challenge.account_number} (${challenge.challenge_type})`;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{challenge.account_number}</h1>
          <p className="text-muted-foreground">
            {challenge.challenge_type} • Phase {challenge.phase}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {validActions.map((action) => {
            const config = ACTION_CONFIG[action];
            const Icon = config.icon;
            return (
              <Button
                key={action}
                variant={config.variant}
                size="sm"
                className="gap-1.5"
                onClick={() => setActionModal(action)}
              >
                <Icon className="h-3.5 w-3.5" /> {config.label}
              </Button>
            );
          })}

          {/* Founder-only: Delete / Archive */}
          {isFounder && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteModalOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete / Archive
            </Button>
          )}
        </div>
      </div>

      {/* Pass Criteria Banner */}
      {challenge.status === 'active' && passCriteriaMet && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4">
          <h3 className="font-semibold text-green-800 dark:text-green-400">
            ✓ All Pass Criteria Met
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">
            Profit target achieved • Drawdown compliant • Minimum trading days completed
          </p>
        </div>
      )}

      {/* Archived banner */}
      {challenge.status === 'archived' && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-800 p-4">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-400">
            This account is archived. Historical data is preserved.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Performance Metrics */}
        <Card>
          <CardHeader><CardTitle className="text-base">Performance</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Account Size"    value={formatCurrency(challenge.initial_balance)} />
            <Row label="Current Balance" value={formatCurrency(challenge.current_balance)} />
            <Row
              label="Profit"
              value={formatPercentage(challenge.profit_pct)}
              valueClass={challenge.profit_pct >= 0 ? 'text-green-600' : 'text-red-600'}
            />
            <Row label="Target" value={formatPercentage(challenge.profit_target_pct)} />
          </CardContent>
        </Card>

        {/* Drawdown Compliance */}
        <Card>
          <CardHeader><CardTitle className="text-base">Drawdown</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Daily DD Used"
              value={`${formatPercentage(challenge.max_daily_drawdown_pct)} / ${formatPercentage(challenge.daily_drawdown_limit_pct)}`}
              valueClass={challenge.max_daily_drawdown_pct > challenge.daily_drawdown_limit_pct ? 'text-red-600 font-medium' : ''}
            />
            <Row
              label="Max DD Used"
              value={`${formatPercentage(challenge.max_drawdown_pct)} / ${formatPercentage(challenge.max_drawdown_limit_pct)}`}
              valueClass={challenge.max_drawdown_pct > challenge.max_drawdown_limit_pct ? 'text-red-600 font-medium' : ''}
            />
          </CardContent>
        </Card>

        {/* Trading Days */}
        <Card>
          <CardHeader><CardTitle className="text-base">Trading Days</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Completed" value={`${challenge.trading_days_completed} / ${challenge.min_trading_days}`} />
            <Row label="Started"   value={new Date(challenge.started_at).toLocaleDateString()} />
            {challenge.expires_at && (
              <Row label="Expires" value={new Date(challenge.expires_at).toLocaleDateString()} />
            )}
            {challenge.completed_at && (
              <Row label="Completed" value={new Date(challenge.completed_at).toLocaleDateString()} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Origin & Linkage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Customer</CardTitle>
              <Link
                href={`/users/${challenge.user_id}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View Profile <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs">{challenge.user_id}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Originating Purchase</CardTitle>
              {challenge.purchase_order_id && (
                <Link
                  href={`/purchases/${challenge.purchase_order_id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View Order <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {challenge.purchase_order_id ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs">{challenge.purchase_order_id}</span>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-2">
                No linked purchase order (may be manually assigned)
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Timeline History</CardTitle></CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No timeline events yet.</p>
          ) : (
            <Timeline events={timeline} hasMore={timeline.length >= 50} />
          )}
        </CardContent>
      </Card>

      {/* ── Action Modal (pass / fail / retry / etc.) ── */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { setActionModal(null); setReason(''); setActionError(''); }}
          />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold capitalize">{actionModal} Challenge</h3>
            <p className="text-sm text-muted-foreground">
              {actionModal === 'pass' || actionModal === 'fail'
                ? `Provide a written justification (minimum ${ACTION_CONFIG[actionModal].minReason} characters).`
                : `Provide a reason for this action (minimum ${ACTION_CONFIG[actionModal].minReason} characters).`}
            </p>
            {actionError && (
              <div className="text-sm text-destructive">{actionError}</div>
            )}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason..."
              className="w-full min-h-[100px] rounded border bg-background px-3 py-2 text-sm resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {reason.length} / {ACTION_CONFIG[actionModal].minReason} min characters
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setActionModal(null); setReason(''); setActionError(''); }}
              >
                Cancel
              </Button>
              <Button
                variant={ACTION_CONFIG[actionModal].variant}
                onClick={handleAction}
                disabled={actionLoading || reason.length < ACTION_CONFIG[actionModal].minReason}
              >
                {actionLoading
                  ? 'Processing...'
                  : `Confirm ${ACTION_CONFIG[actionModal].label}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Founder Delete / Archive Modal ── */}
      {deleteModalOpen && (
        <DeleteArchiveModal
          accountId={challengeId}
          accountLabel={accountLabel}
          onClose={() => setDeleteModalOpen(false)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}

// ── Helper sub-component ──────────────────────────────────────────────────────
function Row({
  label,
  value,
  valueClass = '',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
