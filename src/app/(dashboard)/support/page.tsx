'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import type { ColumnDef } from '@tanstack/react-table';

interface TicketRow { id: string; ticket_number: string; subject: string; category: string; priority: string; status: string; assigned_agent_id: string | null; sla_breached: boolean; created_at: string; updated_at: string; }

const priorityColors: Record<string, string> = { critical: 'bg-red-100 text-red-800', high: 'bg-orange-100 text-orange-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-blue-100 text-blue-800' };
const statusColors: Record<string, string> = { open: 'bg-blue-100 text-blue-800', in_progress: 'bg-yellow-100 text-yellow-800', escalated: 'bg-orange-100 text-orange-800', resolved: 'bg-green-100 text-green-800', closed: 'bg-gray-100 text-gray-800' };

const columns: ColumnDef<TicketRow, any>[] = [
  { accessorKey: 'ticket_number', header: '#' },
  { accessorKey: 'subject', header: 'Subject' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'priority', header: 'Priority', cell: ({ getValue }) => { const p = getValue() as string; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${priorityColors[p] || ''}`}>{p}</span>; } },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => { const s = getValue() as string; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s.replace(/_/g, ' ')}</span>; } },
  { accessorKey: 'sla_breached', header: 'SLA', cell: ({ getValue }) => getValue() ? <span className="text-red-600 font-bold">BREACHED</span> : <span className="text-green-600">OK</span> },
  { accessorKey: 'created_at', header: 'Created', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', priority: '' });

  useEffect(() => { fetchTickets(); }, [filters]);
  async function fetchTickets() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      const res = await apiFetch(`/api/support?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setTickets(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch { setError('Failed to load tickets.'); }
    finally { setLoading(false); }
  }

  if (error) return <ErrorState message={error} onRetry={fetchTickets} />;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Support Operations Center</h1><p className="text-muted-foreground">Ticket management, escalation, and resolution tracking</p></div>
      <FilterBar onClear={() => setFilters({ status: '', priority: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={[{ label: 'Open', value: 'open' }, { label: 'In Progress', value: 'in_progress' }, { label: 'Escalated', value: 'escalated' }, { label: 'Resolved', value: 'resolved' }, { label: 'Closed', value: 'closed' }]} />
        <SelectFilter label="Priority" value={filters.priority} onChange={(v) => setFilters(f => ({ ...f, priority: v }))} options={[{ label: 'Critical', value: 'critical' }, { label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }]} />
      </FilterBar>
      {loading ? <LoadingState rows={8} /> : tickets.length === 0 ? <EmptyState message="No tickets match filters." /> : <DataTable columns={columns} data={tickets} pageSize={20} totalCount={totalCount} />}
    </div>
  );
}
