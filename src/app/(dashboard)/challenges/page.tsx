'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

interface ChallengeRow {
  id: string;
  account_number: string;
  user_id: string;
  user_email?: string;
  challenge_type: string;
  phase: number;
  status: string;
  initial_balance: number;
  profit_pct: number;
  max_drawdown_pct: number;
  trading_days_completed: number;
  min_trading_days: number;
  started_at: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  passed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const columns: ColumnDef<ChallengeRow, any>[] = [
  { accessorKey: 'account_number', header: 'Account' },
  { accessorKey: 'user_email', header: 'Trader', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'challenge_type', header: 'Type' },
  { accessorKey: 'phase', header: 'Phase', cell: ({ getValue }) => `Phase ${getValue()}` },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string;
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s}</span>;
    },
  },
  { accessorKey: 'initial_balance', header: 'Size', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'profit_pct', header: 'Profit', cell: ({ getValue }) => formatPercentage(getValue() as number) },
  { accessorKey: 'max_drawdown_pct', header: 'Max DD', cell: ({ getValue }) => formatPercentage(getValue() as number) },
  {
    accessorKey: 'trading_days_completed',
    header: 'Days',
    cell: ({ row }) => `${row.original.trading_days_completed}/${row.original.min_trading_days}`,
  },
  {
    accessorKey: 'started_at',
    header: 'Started',
    cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
  },
];

export default function ChallengesPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', type: '', dateFrom: '', dateTo: '', user: '' });

  useEffect(() => { fetchChallenges(); }, [filters]);

  async function fetchChallenges() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('challenge_type', filters.type);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.user) params.set('user', filters.user);

      const res = await fetch(`/api/challenges?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setChallenges(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch { setError('Failed to load challenges.'); }
    finally { setLoading(false); }
  }

  const hasFilters = Object.values(filters).some(Boolean);

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

      <FilterBar onClear={() => setFilters({ status: '', type: '', dateFrom: '', dateTo: '', user: '' })} hasActiveFilters={hasFilters}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))}
          options={[
            { label: 'Active', value: 'active' }, { label: 'Passed', value: 'passed' },
            { label: 'Failed', value: 'failed' }, { label: 'Expired', value: 'expired' },
            { label: 'Archived', value: 'archived' },
          ]}
        />
        <TextFilter label="Challenge Type" value={filters.type} onChange={(v) => setFilters(f => ({ ...f, type: v }))} placeholder="e.g. Standard 100K" />
        <TextFilter label="User (email/ID)" value={filters.user} onChange={(v) => setFilters(f => ({ ...f, user: v }))} placeholder="Search user..." />
        <DateRangeFilter label="Start Date" from={filters.dateFrom} to={filters.dateTo}
          onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))}
          onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))}
        />
      </FilterBar>

      {loading ? <LoadingState rows={8} /> : challenges.length === 0 ? (
        <EmptyState message="No challenge accounts match the current filters." />
      ) : (
        <DataTable columns={columns} data={challenges} pageSize={20} totalCount={totalCount} />
      )}
    </div>
  );
}
