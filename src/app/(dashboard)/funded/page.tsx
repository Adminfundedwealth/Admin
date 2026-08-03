'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { DeleteArchiveModal } from '@/components/shared/delete-archive-modal';
import { useIsFounder } from '@/hooks/use-is-founder';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface FundedRow {
  id: string;
  account_number?: string;
  trader_id?: string;
  user_id?: string;
  type?: string;
  plan?: string;
  initial_balance: number;
  current_balance: number;
  peak_balance?: number;
  profit_loss?: number;
  profit_split_pct?: number;
  daily_drawdown_used_pct?: number;
  daily_drawdown_limit_pct?: number;
  max_drawdown_used_pct?: number;
  max_drawdown_limit_pct?: number;
  violation_count?: number;
  payout_eligible?: boolean;
  ineligibility_reason?: string | null;
  status: string;
  passed_at?: string | null;
  funded_at?: string;
  created_at?: string;
}

const statusColors: Record<string, string> = {
  active:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  passed:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended:'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  breached: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  closed:   'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function FundedPage() {
  const { isFounder } = useIsFounder();
  const [accounts, setAccounts] = useState<FundedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', eligible: '' });

  // Delete / Archive modal state
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteModalLabel, setDeleteModalLabel] = useState('');

  useEffect(() => { fetchAccounts(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAccounts() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.eligible) params.set('payout_eligible', filters.eligible);
      const res = await apiFetch(`/api/funded?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setAccounts(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch {
      setError('Failed to load funded accounts.');
    } finally {
      setLoading(false);
    }
  }

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

  function getRowActions(row: FundedRow): RowAction[] {
    const actions: RowAction[] = [];
    if (isFounder) {
      actions.push({
        id: 'delete-archive',
        label: 'Delete / Archive…',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        variant: 'destructive',
        onClick: () => {
          const label = (row.account_number || row.id.slice(0, 12)) +
            (row.type || row.plan ? ` (${(row.type || row.plan)?.replace(/_/g, ' ')})` : '');
          setDeleteModalLabel(label);
          setDeleteModalId(row.id);
        },
      });
    }
    return actions;
  }

  // Build columns — include RowActions only when there are actions to show
  const columns: ColumnDef<FundedRow, unknown>[] = [
    {
      accessorKey: 'id',
      header: 'Account',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.account_number || row.original.id.slice(0, 10) + '…'}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-xs capitalize">
          {(row.original.type || row.original.plan || '—').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      accessorKey: 'initial_balance',
      header: 'Size',
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: 'current_balance',
      header: 'Balance',
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      id: 'pnl',
      header: 'P&L',
      cell: ({ row }) => {
        const initial = row.original.initial_balance;
        const current = row.original.current_balance;
        const pnl = row.original.profit_loss ?? (current - initial);
        return (
          <span className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(pnl)}
          </span>
        );
      },
    },
    {
      id: 'drawdown',
      header: 'DD Used',
      cell: ({ row }) => {
        const used = row.original.max_drawdown_used_pct;
        const limit = row.original.max_drawdown_limit_pct;
        if (used == null || limit == null) return '—';
        const pct = limit > 0 ? (used / limit) * 100 : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="text-xs">{formatPercentage(used)}</span>
          </div>
        );
      },
    },
    {
      id: 'eligible',
      header: 'Eligible',
      cell: ({ row }) => {
        const eligible = row.original.payout_eligible;
        if (eligible == null) return <span className="text-muted-foreground">—</span>;
        return eligible
          ? <span className="text-green-600 font-medium">Yes</span>
          : <span className="text-muted-foreground" title={row.original.ineligibility_reason || ''}>No</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return (
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>
            {s}
          </span>
        );
      },
    },
    {
      id: 'date',
      header: 'Funded',
      cell: ({ row }) => {
        const d = row.original.passed_at || row.original.funded_at || row.original.created_at;
        return d ? new Date(d).toLocaleDateString() : '—';
      },
    },
    // Founder-only actions column
    ...(isFounder
      ? [{
          id: 'actions',
          header: '' as string,
          cell: ({ row }: { row: { original: FundedRow } }) => (
            <div className="group">
              <RowActions actions={getRowActions(row.original)} />
            </div>
          ),
        } as ColumnDef<FundedRow, unknown>]
      : []),
  ];

  if (error) return <ErrorState message={error} onRetry={fetchAccounts} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Funded Trader Center</h1>
          <p className="text-muted-foreground">Monitor performance, eligibility, and profit sharing</p>
        </div>
        <ExportButton sourceCenter="funded" filters={filters} totalCount={totalCount} />
      </div>

      <FilterBar
        onClear={() => setFilters({ status: '', eligible: '' })}
        hasActiveFilters={Object.values(filters).some(Boolean)}
      >
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { label: 'Active',   value: 'active'   },
            { label: 'Passed',   value: 'passed'   },
            { label: 'Suspended',value: 'suspended'},
            { label: 'Breached', value: 'breached' },
            { label: 'Closed',   value: 'closed'   },
            { label: 'Archived', value: 'archived' },
          ]}
        />
        <SelectFilter
          label="Payout Eligible"
          value={filters.eligible}
          onChange={(v) => setFilters((f) => ({ ...f, eligible: v }))}
          options={[
            { label: 'Eligible',     value: 'true'  },
            { label: 'Not Eligible', value: 'false' },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState rows={8} />
      ) : accounts.length === 0 ? (
        <EmptyState message="No funded accounts match the current filters." />
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          pageSize={20}
          totalCount={totalCount}
        />
      )}

      {/* Founder Delete / Archive Modal */}
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
