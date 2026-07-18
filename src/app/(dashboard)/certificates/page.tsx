'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, DateRangeFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Award } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface CertRow { id: string; certificate_number: string; user_id: string; trader_name: string; type: string; status: string; generated_at: string; }

const columns: ColumnDef<CertRow, any>[] = [
  { accessorKey: 'certificate_number', header: 'Certificate #' },
  { accessorKey: 'trader_name', header: 'Trader' },
  { accessorKey: 'type', header: 'Type', cell: ({ getValue }) => (getValue() as string).replace(/_/g, ' ') },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <span className={getValue() === 'active' ? 'text-green-600' : 'text-red-600'}>{getValue() as string}</span> },
  { accessorKey: 'generated_at', header: 'Generated', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
];

export default function CertificatesPage() {
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ type: '', dateFrom: '', dateTo: '' });

  useEffect(() => { fetchCerts(); }, [filters]);
  async function fetchCerts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type) params.set('type', filters.type);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      const res = await apiFetch(`/api/certificates?${params.toString()}`);
      const json = await res.json();
      setCerts(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch {} finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Certificate Center</h1><p className="text-muted-foreground">Generate and manage trader certificates</p></div>
        <Button className="gap-2"><Award className="h-4 w-4" /> Generate Certificate</Button>
      </div>
      <FilterBar onClear={() => setFilters({ type: '', dateFrom: '', dateTo: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Type" value={filters.type} onChange={(v) => setFilters(f => ({ ...f, type: v }))} options={[{ label: 'Challenge Completion', value: 'challenge_completion' }, { label: 'Funded Trader', value: 'funded_trader' }]} />
        <DateRangeFilter label="Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
      </FilterBar>
      {loading ? <LoadingState rows={6} /> : certs.length === 0 ? <EmptyState message="No certificates found." /> : <DataTable columns={columns} data={certs} pageSize={20} totalCount={totalCount} />}
    </div>
  );
}
