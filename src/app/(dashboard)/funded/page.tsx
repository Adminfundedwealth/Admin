'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

interface FundedRow {
  id: string;
  account_number: string;
  user_id: string;
  account_size: number;
  current_equity: number;
  profit_loss: number;
  profit_split_pct: number;
  daily_drawdown_used_pct: number;
  daily_drawdown_limit_pct: number;
  max_drawdown_used_pct: number;
  max_drawdown_limit_pct: number;
  violation_count: number;
  payout_eligible: boolean;
  ineligibility_reason: string | null;
  status: string;
  funded_at: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  breached: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const columns: ColumnDef<FundedRow, any>[] = [
  { accessorKey: 'account_number', header: 'Account' },
  { accessorKey: 'account_size', header: 'Size', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'current_equity', header: 'Equity', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  {
    accessorKey: 'profit_loss',
    header: 'P&L',
    cell: ({ getValue }) => {
      const val = getValue() as number;
      return <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(val)}</span>;
    },
  },
  {
    accessorKey: 'max_drawdown_used_pct',
    header: 'DD Used',
    cell: ({ row }) => {
      const used = row.original.max_drawdown_used_pct;
      const limit = row.original.max_drawdown_limit_pct;
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
  { accessorKey: 'violation_count', header: 'Violations' },
  {
    accessorKey: 'payout_eligible',
    header: 'Eligible',
    cell: ({ row }) => row.original.payout_eligible
      ? <span className="text-green-600 font-medium">Yes</span>
      : <span className="text-muted-foreground" title={row.original.ineligibility_reason || ''}>No</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string;
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s}</span>;
    },
  },
  {
    accessorKey: 'funded_at',
    header: 'Funded',
    cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
  },
];

export default function FundedPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FundedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', eligible: '' });

  useEffect(() => { fetchAccounts(); }, [filters]);

  async function fetchAccounts() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.eligible) params.set('payout_eligible', filters.eligible);
      const res = await fetch(`/api/funded?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setAccounts(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch { setError('Failed to load funded accounts.'); }
    finally { setLoading(false); }
  }

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

      <FilterBar onClear={() => setFilters({ status: '', eligible: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))}
          options={[{ label: 'Active', value: 'active' }, { label: 'Suspended', value: 'suspended' }, { label: 'Breached', value: 'breached' }, { label: 'Closed', value: 'closed' }]}
        />
        <SelectFilter label="Payout Eligible" value={filters.eligible} onChange={(v) => setFilters(f => ({ ...f, eligible: v }))}
          options={[{ label: 'Eligible', value: 'true' }, { label: 'Not Eligible', value: 'false' }]}
        />
      </FilterBar>

      {loading ? <LoadingState rows={8} /> : accounts.length === 0 ? (
        <EmptyState message="No funded accounts match the current filters." />
      ) : (
        <DataTable columns={columns} data={accounts} pageSize={20} totalCount={totalCount} />
      )}
    </div>
  );
}
