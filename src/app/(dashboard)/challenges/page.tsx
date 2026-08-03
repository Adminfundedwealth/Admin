'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar, CHALLENGE_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SlidePanel } from '@/components/shared/slide-panel';
import { DeleteArchiveModal } from '@/components/shared/delete-archive-modal';
import { useIsFounder } from '@/hooks/use-is-founder';
import { formatCurrency } from '@/lib/utils';
import { Eye, CheckCircle, XCircle, RotateCcw, Trash2 } from 'lucide-react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

// Matches actual challenge_accounts table columns returned by GET /api/challenges
interface ChallengeRow {
  id: string;
  trader_id: string | null;
  type: string | null;          // e.g. "evaluation_phase1"
  plan: string | null;          // e.g. "standard"
  initial_balance: number | null;
  current_balance: number | null;
  peak_balance: number | null;
  profit_target_pct: number | null;
  daily_loss_limit_pct: number | null;
  max_drawdown_pct: number | null;
  min_trading_days: number | null;
  max_calendar_days: number | null;
  status: string | null;
  started_at: string | null;
  expires_at: string | null;
  passed_at: string | null;
  failed_at: string | null;
  fail_reason: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  passed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

// Derive a human-readable profit% from balance figures
function deriveProfitPct(row: ChallengeRow): number | null {
  const initial = row.initial_balance;
  const current = row.current_balance;
  if (!initial || initial === 0 || current == null) return null;
  return ((current - initial) / initial) * 100;
}

export default function ChallengesPage() {
  const { isFounder } = useIsFounder();
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', type: '', dateFrom: '', dateTo: '', user: '' });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeRow | null>(null);
  // Delete/Archive modal state
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteModalLabel, setDeleteModalLabel] = useState('');

  const selectedIds = Object.keys(rowSelection)
    .filter((k) => rowSelection[k])
    .map((idx) => challenges[parseInt(idx)]?.id)
    .filter(Boolean);

  useEffect(() => { fetchChallenges(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchChallenges() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('challenge_type', filters.type);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.user) params.set('trader_id', filters.user);
      const res = await apiFetch(`/api/challenges?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setChallenges(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch {
      setError('Failed to load challenges.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchAction(actionId: string, reason?: string) {
    for (const id of selectedIds) {
      await apiFetch(`/api/challenges/${id}/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || actionId }),
      });
    }
    setRowSelection({});
    fetchChallenges();
  }

  async function handleSingleAction(id: string, action: string) {
    await apiFetch(`/api/challenges/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: `Inline ${action} action` }),
    });
    fetchChallenges();
  }

  function getRowActions(row: ChallengeRow): RowAction[] {
    const actions: RowAction[] = [
      {
        id: 'view',
        label: 'View Details',
        icon: <Eye className="h-3.5 w-3.5" />,
        onClick: () => { setSelectedChallenge(row); setPanelOpen(true); },
      },
    ];
    if (row.status === 'active') {
      actions.push({ id: 'pass', label: 'Pass', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleSingleAction(row.id, 'pass') });
      actions.push({ id: 'fail', label: 'Fail', icon: <XCircle className="h-3.5 w-3.5" />, variant: 'destructive', onClick: () => handleSingleAction(row.id, 'fail') });
    }
    if (row.status === 'failed' || row.status === 'expired') {
      actions.push({ id: 'reset', label: 'Reset', icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => handleSingleAction(row.id, 'reset') });
    }
    // Founder-only: Delete / Archive
    if (isFounder) {
      actions.push({
        id: 'delete-archive',
        label: 'Delete / Archive…',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        variant: 'destructive',
        onClick: () => {
          const label = row.id.slice(0, 12) + '…' + (row.type ? ` (${row.type.replace(/_/g, ' ')})` : '');
          setDeleteModalLabel(label);
          setDeleteModalId(row.id);
        },
      });
    }
    return actions;
  }

  function handleDeleteSuccess(action: 'archive' | 'permanent_delete', accountId: string) {
    setDeleteModalId(null);
    if (action === 'permanent_delete') {
      // Remove the account from the list immediately
      setChallenges((prev) => prev.filter((c) => c.id !== accountId));
    } else {
      // Mark as archived in the list (keep visible — filter will hide if status filter is set)
      setChallenges((prev) =>
        prev.map((c) => c.id === accountId ? { ...c, status: 'archived' } : c),
      );
    }
  }

  const columns: ColumnDef<ChallengeRow, unknown>[] = [
    {
      accessorKey: 'id',
      header: 'Account',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return <span className="font-mono text-[11px]">{v ? v.slice(0, 8) + '…' : '—'}</span>;
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return <span className="text-[12px]">{v ? v.replace(/_/g, ' ') : '—'}</span>;
      },
    },
    {
      accessorKey: 'plan',
      header: 'Plan',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return <span className="text-[12px] capitalize">{v || '—'}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = (getValue() as string | null) ?? '';
        return (
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || 'bg-gray-100 text-gray-800'}`}>
            {s || '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'initial_balance',
      header: 'Size',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v != null ? formatCurrency(v) : '—';
      },
    },
    {
      id: 'profit_pct',
      header: 'Profit',
      cell: ({ row }) => {
        const pct = deriveProfitPct(row.original);
        if (pct == null) return '—';
        return (
          <span className={pct >= 0 ? 'text-green-600' : 'text-red-600'}>
            {pct.toFixed(2)}%
          </span>
        );
      },
    },
    {
      accessorKey: 'max_drawdown_pct',
      header: 'Max DD',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v != null ? `${v.toFixed(2)}%` : '—';
      },
    },
    {
      accessorKey: 'started_at',
      header: 'Started',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? new Date(v).toLocaleDateString() : '—';
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <div className="group"><RowActions actions={getRowActions(row.original)} /></div>,
    },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchChallenges} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Challenge Operations Center</h1>
          <p className="text-muted-foreground">Manage the complete lifecycle of every challenge account</p>
        </div>
        <ExportButton sourceCenter="challenges" filters={filters} totalCount={totalCount} />
      </div>

      <FilterBar
        onClear={() => setFilters({ status: '', type: '', dateFrom: '', dateTo: '', user: '' })}
        hasActiveFilters={Object.values(filters).some(Boolean)}
      >
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { label: 'Active', value: 'active' },
            { label: 'Passed', value: 'passed' },
            { label: 'Failed', value: 'failed' },
            { label: 'Expired', value: 'expired' },
            { label: 'Archived', value: 'archived' },
          ]}
        />
        <TextFilter label="Type" value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} placeholder="e.g. evaluation" />
        <TextFilter label="Trader ID" value={filters.user} onChange={(v) => setFilters((f) => ({ ...f, user: v }))} placeholder="Trader ID" />
        <DateRangeFilter
          label="Start Date"
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
        />
      </FilterBar>

      {loading ? (
        <LoadingState rows={8} />
      ) : challenges.length === 0 ? (
        <EmptyState message="No challenges match filters." />
      ) : (
        <DataTable
          columns={columns}
          data={challenges}
          pageSize={20}
          totalCount={totalCount}
          enableRowSelection
          onRowSelectionChange={setRowSelection}
        />
      )}

      <BatchActionBar
        selectedCount={selectedIds.length}
        actions={CHALLENGE_BATCH_ACTIONS}
        onAction={handleBatchAction}
        onClear={() => setRowSelection({})}
      />

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={selectedChallenge ? (selectedChallenge.id.slice(0, 12) + '…') : 'Challenge'}
        subtitle={selectedChallenge?.type?.replace(/_/g, ' ') ?? undefined}
      >
        {selectedChallenge && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize font-medium">{selectedChallenge.type?.replace(/_/g, ' ') || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="capitalize font-medium">{selectedChallenge.plan || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize font-medium">{selectedChallenge.status || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size</span>
              <span>{selectedChallenge.initial_balance != null ? formatCurrency(selectedChallenge.initial_balance) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Balance</span>
              <span>{selectedChallenge.current_balance != null ? formatCurrency(selectedChallenge.current_balance) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Profit</span>
              <span className={(() => { const p = deriveProfitPct(selectedChallenge); return p != null && p < 0 ? 'text-red-600' : 'text-green-600'; })()}>
                {(() => { const p = deriveProfitPct(selectedChallenge); return p != null ? `${p.toFixed(2)}%` : '—'; })()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max DD</span>
              <span>{selectedChallenge.max_drawdown_pct != null ? `${selectedChallenge.max_drawdown_pct}%` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Trading Days</span>
              <span>{selectedChallenge.min_trading_days ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span>{selectedChallenge.started_at ? new Date(selectedChallenge.started_at).toLocaleDateString() : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{selectedChallenge.expires_at ? new Date(selectedChallenge.expires_at).toLocaleDateString() : '—'}</span>
            </div>
            {selectedChallenge.fail_reason && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fail Reason</span>
                <span className="text-red-600 text-right max-w-[60%]">{selectedChallenge.fail_reason}</span>
              </div>
            )}

            {/* Founder-only: Delete / Archive from slide panel */}
            {isFounder && (
              <div className="pt-4 border-t">
                <button
                  onClick={() => {
                    setPanelOpen(false);
                    const label = selectedChallenge.id.slice(0, 12) + '…' + (selectedChallenge.type ? ` (${selectedChallenge.type.replace(/_/g, ' ')})` : '');
                    setDeleteModalLabel(label);
                    setDeleteModalId(selectedChallenge.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-destructive hover:bg-destructive/10 border border-destructive/30 transition-colors"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Delete / Archive Account…
                </button>
              </div>
            )}
          </div>
        )}
      </SlidePanel>

      {/* Founder Delete/Archive modal */}
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
