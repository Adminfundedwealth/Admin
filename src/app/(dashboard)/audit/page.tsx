'use client';
import { apiFetch, readApiJson } from '@/lib/api/fetch';

import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import type { ColumnDef } from '@tanstack/react-table';

interface AuditRow { id: string; actor_id: string; actor_role: string; action: string; target_entity_type: string; target_entity_id: string; timestamp: string; ip_address: string; }

function isAuditRow(value: unknown): value is AuditRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.actor_id === 'string' &&
    typeof row.actor_role === 'string' &&
    typeof row.action === 'string' &&
    typeof row.target_entity_type === 'string' &&
    typeof row.target_entity_id === 'string' &&
    typeof row.timestamp === 'string' &&
    typeof row.ip_address === 'string'
  );
}

const columns: ColumnDef<AuditRow, any>[] = [
  { accessorKey: 'timestamp', header: 'Timestamp', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? new Date(v).toLocaleString() : '—'; } },
  { accessorKey: 'actor_role', header: 'Role', cell: ({ getValue }) => (getValue() as string | null) || '—' },
  { accessorKey: 'action', header: 'Action', cell: ({ getValue }) => (getValue() as string | null) || '—' },
  { accessorKey: 'target_entity_type', header: 'Entity', cell: ({ getValue }) => (getValue() as string | null) || '—' },
  { accessorKey: 'target_entity_id', header: 'Target', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? v.slice(0, 8) + '…' : '—'; } },
  { accessorKey: 'ip_address', header: 'IP', cell: ({ getValue }) => (getValue() as string | null) || '—' },
];

export default function AuditPage() {
  const [records, setRecords] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ action: '', entity: '', dateFrom: '', dateTo: '', ip: '' });

  const fetchAudit = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set('action', filters.action);
      if (filters.entity) params.set('target_entity_type', filters.entity);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.ip) params.set('ip_address', filters.ip);
      const res = await apiFetch(`/api/audit?${params.toString()}`);
      const json = await readApiJson(res);
      if (!res.ok) {
        const apiError = json.error;
        const message = apiError && typeof apiError === 'object'
          ? (apiError as Record<string, unknown>).message
          : null;
        throw new Error(typeof message === 'string' ? message : `Audit request failed (${res.status})`);
      }
      if (!Array.isArray(json.data) || !json.data.every(isAuditRow)) {
        throw new Error('The audit service returned an invalid response');
      }

      setRecords(json.data);
      const meta = json.meta;
      const totalCount = meta && typeof meta === 'object'
        ? (meta as Record<string, unknown>).totalCount
        : null;
      setTotalCount(typeof totalCount === 'number' ? totalCount : 0);
    } catch (error) {
      console.error('Failed to load audit records:', error);
      setError(error instanceof Error ? error.message : 'Failed to load audit records');
    }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void fetchAudit(); }, [fetchAudit]);

  if (error) return <ErrorState message={error} onRetry={fetchAudit} />;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Audit & Compliance Center</h1><p className="text-muted-foreground">Immutable record of all administrative actions</p></div>
      <FilterBar onClear={() => setFilters({ action: '', entity: '', dateFrom: '', dateTo: '', ip: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <TextFilter label="Action" value={filters.action} onChange={(v) => setFilters(f => ({ ...f, action: v }))} placeholder="e.g. payout.approve" />
        <TextFilter label="Entity Type" value={filters.entity} onChange={(v) => setFilters(f => ({ ...f, entity: v }))} placeholder="e.g. user" />
        <DateRangeFilter label="Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
        <TextFilter label="IP Address" value={filters.ip} onChange={(v) => setFilters(f => ({ ...f, ip: v }))} placeholder="e.g. 192.168.1.1" />
      </FilterBar>
      {loading ? <LoadingState rows={10} /> : records.length === 0 ? <EmptyState message="No audit records match filters." /> : <DataTable columns={columns} data={records} pageSize={100} pageSizeOptions={[50, 100]} totalCount={totalCount} />}
    </div>
  );
}
