'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, DateRangeFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ColumnDef } from '@tanstack/react-table';

interface RiskRow {
  id: string;
  alert_type: string;
  severity: string;
  status: string;
  account_id: string;
  breach_type: string | null;
  breach_amount: number | null;
  created_at: string;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const columns: ColumnDef<RiskRow, any>[] = [
  { accessorKey: 'severity', header: 'Severity', cell: ({ getValue }) => { const s = getValue() as string; return <span className={`px-2 py-0.5 text-xs rounded-full font-bold uppercase ${severityColors[s] || ''}`}>{s}</span>; } },
  { accessorKey: 'alert_type', header: 'Type' },
  { accessorKey: 'breach_type', header: 'Breach', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'account_id', header: 'Account', cell: ({ getValue }) => (getValue() as string).slice(0, 8) + '...' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <span className="capitalize">{getValue() as string}</span> },
  { accessorKey: 'created_at', header: 'Generated', cell: ({ getValue }) => new Date(getValue() as string).toLocaleString() },
];

export default function RiskPage() {
  const [alerts, setAlerts] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ severity: '', status: '', dateFrom: '', dateTo: '' });

  useEffect(() => { fetchAlerts(); }, [filters]);

  async function fetchAlerts() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      const res = await fetch(`/api/risk?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setAlerts(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch { setError('Failed to load risk alerts.'); }
    finally { setLoading(false); }
  }

  if (error) return <ErrorState message={error} onRetry={fetchAlerts} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Risk Management Center</h1>
        <p className="text-muted-foreground">Monitor drawdown breaches, rule violations, and trading anomalies</p>
      </div>
      <FilterBar onClear={() => setFilters({ severity: '', status: '', dateFrom: '', dateTo: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Severity" value={filters.severity} onChange={(v) => setFilters(f => ({ ...f, severity: v }))} options={[{ label: 'Critical', value: 'critical' }, { label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }]} />
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={[{ label: 'Open', value: 'open' }, { label: 'Acknowledged', value: 'acknowledged' }, { label: 'Resolved', value: 'resolved' }]} />
        <DateRangeFilter label="Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
      </FilterBar>
      {loading ? <LoadingState rows={8} /> : alerts.length === 0 ? <EmptyState message="No risk alerts match filters." /> : <DataTable columns={columns} data={alerts} pageSize={20} totalCount={totalCount} />}
    </div>
  );
}
