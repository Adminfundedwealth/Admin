'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

interface AffiliateRow {
  id: string;
  name: string;
  email: string;
  affiliate_code: string;
  total_referrals: number;
  total_revenue_generated: number;
  commission_earned: number;
  commission_paid: number;
  commission_pending: number;
  status: string;
}

interface AffiliateAnalytics {
  totalActive: number;
  totalSuspended: number;
  totalCommissionPending: number;
  totalCommissionPaid: number;
}

const statusColors: Record<string, string> = {
  active:     'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  terminated: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const columns: ColumnDef<AffiliateRow, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'affiliate_code', header: 'Code', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
  { accessorKey: 'total_referrals', header: 'Referrals' },
  { accessorKey: 'total_revenue_generated', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'commission_earned', header: 'Earned', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'commission_pending', header: 'Pending', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string;
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${statusColors[s] || ''}`}>{s}</span>;
    },
  },
];

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [analytics, setAnalytics] = useState<AffiliateAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '' });

  useEffect(() => { fetchAffiliates(); }, [filters]);

  async function fetchAffiliates() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      const res = await apiFetch(`/api/affiliates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setAffiliates(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
      setAnalytics(json.analytics || null);
    } catch {
      setError('Failed to load affiliates.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Affiliate Operations Center</h1>
          <p className="text-muted-foreground">Manage affiliates, referrals, and commissions</p>
        </div>
        <ExportButton sourceCenter="affiliates" filters={filters} totalCount={totalCount} />
      </div>

      {analytics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Affiliates</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{analytics.totalActive}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Suspended</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-600">{analytics.totalSuspended}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Commission Pending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatCurrency(analytics.totalCommissionPending)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Commission Paid</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatCurrency(analytics.totalCommissionPaid)}</div></CardContent>
          </Card>
        </div>
      )}

      <FilterBar onClear={() => setFilters({ status: '' })} hasActiveFilters={!!filters.status}>
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters({ status: v })}
          options={[
            { label: 'Active', value: 'active' },
            { label: 'Suspended', value: 'suspended' },
            { label: 'Terminated', value: 'terminated' },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchAffiliates} />
      ) : affiliates.length === 0 ? (
        <EmptyState message="No affiliates found." />
      ) : (
        <DataTable columns={columns} data={affiliates} pageSize={20} totalCount={totalCount} />
      )}
    </div>
  );
}
