'use client';

/**
 * /founder/delete-accounts
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder-only page. Shows all challenge accounts with quick access to
 * Delete / Archive. Designed as a dedicated management surface so the Founder
 * can bulk-review and act without navigating per-account detail pages.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { DeleteArchiveModal } from '@/components/shared/delete-archive-modal';
import { formatCurrency } from '@/lib/utils';
import {
  ShieldAlert, Trash2, Archive, RefreshCw,
  AlertTriangle, CheckCircle,
} from 'lucide-react';

interface AccountRow {
  id: string;
  type: string | null;
  plan: string | null;
  status: string | null;
  initial_balance: number | null;
  current_balance: number | null;
  trader_id: string | null;
  started_at: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  passed:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired:  'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

type StatusFilter = 'all' | 'active' | 'passed' | 'failed' | 'expired' | 'archived';

export default function FounderDeleteAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  // Delete / Archive modal
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteModalLabel, setDeleteModalLabel] = useState('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page_size', '100');
      const res = await apiFetch(`/api/challenges?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load accounts');
      const json = await res.json();
      setAccounts(json.data || []);
    } catch {
      setError('Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  function handleDeleteSuccess(action: 'archive' | 'permanent_delete', accountId: string) {
    setDeleteModalId(null);
    if (action === 'permanent_delete') {
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } else {
      setAccounts((prev) =>
        prev.map((a) => a.id === accountId ? { ...a, status: 'archived' } : a),
      );
    }
  }

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: 'all',      label: 'All'      },
    { value: 'active',   label: 'Active'   },
    { value: 'passed',   label: 'Passed'   },
    { value: 'failed',   label: 'Failed'   },
    { value: 'expired',  label: 'Expired'  },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-destructive" />
          Delete / Archive Accounts
        </h1>
        <p className="text-muted-foreground mt-1">
          Founder-only. Permanently delete or archive trading accounts.
          All actions are recorded in the immutable audit log.
        </p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-destructive">Irreversible for Permanent Delete.</p>
          <p className="text-muted-foreground">
            Archive preserves all data and is reversible.
            Permanent Delete purges the trading account row and terminal credentials — the challenge account is
            archived for audit history only.
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={fetchAccounts}
          className="ml-auto px-3 py-1.5 rounded-md text-sm border hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchAccounts} />
      ) : accounts.length === 0 ? (
        <EmptyState message={`No ${statusFilter === 'all' ? '' : statusFilter + ' '}accounts found.`} />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} shown
          </p>
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDelete={() => {
                const label = account.id.slice(0, 12) + '…' +
                  (account.type ? ` (${account.type.replace(/_/g, ' ')})` : '');
                setDeleteModalLabel(label);
                setDeleteModalId(account.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Delete / Archive Modal */}
      {deleteModalId && (
        <DeleteArchiveModal
          accountId={deleteModalId}
          accountLabel={deleteModalLabel}
          onClose={() => setDeleteModalId(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────────────────────
function AccountCard({
  account,
  onDelete,
}: {
  account: AccountRow;
  onDelete: () => void;
}) {
  const status = account.status ?? 'unknown';
  const isFunded = status === 'passed';
  const isArchived = status === 'archived';

  return (
    <Card className={`${isArchived ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: account info */}
          <div className="flex items-center gap-4 min-w-0">
            {/* Status indicator */}
            <div className={`w-2 h-2 rounded-full shrink-0 ${
              status === 'active'   ? 'bg-blue-500' :
              status === 'passed'   ? 'bg-green-500' :
              status === 'failed'   ? 'bg-red-500' :
              status === 'expired'  ? 'bg-gray-400' :
              status === 'archived' ? 'bg-purple-500' :
              'bg-gray-300'
            }`} />

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-medium">{account.id.slice(0, 16)}…</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
                  {status}
                </span>
                {isFunded && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> Funded
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {account.type && (
                  <span>{account.type.replace(/_/g, ' ')}</span>
                )}
                {account.initial_balance != null && (
                  <span>{formatCurrency(account.initial_balance)}</span>
                )}
                {account.started_at && (
                  <span>Started {new Date(account.started_at).toLocaleDateString()}</span>
                )}
                {account.trader_id && (
                  <span className="font-mono">trader:{account.trader_id.slice(0, 8)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isArchived ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={onDelete}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5 text-purple-500" /> Archived
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
