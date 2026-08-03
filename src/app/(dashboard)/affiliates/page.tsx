'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

interface AffiliateRow { id: string; name: string; email: string; affiliate_code: string; total_referrals: number; total_revenue_generated: number; commission_earned: number; commission_paid: number; commission_pending: number; status: string; }

const columns: ColumnDef<AffiliateRow, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'affiliate_code', header: 'Code' },
  { accessorKey: 'total_referrals', header: 'Referrals' },
  { accessorKey: 'total_revenue_generated', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'commission_earned', header: 'Earned', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'commission_pending', header: 'Pending', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <span className="capitalize">{getValue() as string}</span> },
];

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '' });

  useEffect(() => { fetchAffiliates(); }, [filters]);
  async function fetchAffiliates() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      const res = await apiFetch(`/api/affiliates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setAffiliates(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch { setError('Failed to load affiliates.'); }
    finally { setLoading(false); }
  }

  if (error) return <ErrorState message={error} onRetry={fetchAffiliates} />;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Affiliate Operations Center</h1><p className="text-muted-foreground">Manage affiliates, referrals, and commissions</p></div>
        <ExportButton sourceCenter="affiliates" filters={filters} totalCount={totalCount} />
      </div>
      <FilterBar onClear={() => setFilters({ status: '' })} hasActiveFilters={!!filters.status}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters({ status: v })} options={[{ label: 'Active', value: 'active' }, { label: 'Suspended', value: 'suspended' }, { label: 'Terminated', value: 'terminated' }]} />
      </FilterBar>
      {loading ? <LoadingState rows={8} /> : affiliates.length === 0 ? <EmptyState message="No affiliates found." /> : <DataTable columns={columns} data={affiliates} pageSize={20} totalCount={totalCount} />}
    </div>
  );
}
