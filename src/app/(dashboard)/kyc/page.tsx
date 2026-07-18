'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar, KYC_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SlidePanel } from '@/components/shared/slide-panel';
import { Eye, CheckCircle, RotateCcw } from 'lucide-react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

interface KYCRow { id: string; user_id: string; status: string; submission_count: number; reviewer_id: string | null; overdue: boolean; created_at: string; }
const statusColors: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', in_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', resubmit_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };

export default function KYCPage() {
  const [submissions, setSubmissions] = useState<KYCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', overdue: '' });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<KYCRow | null>(null);

  const selectedIds = Object.keys(rowSelection).filter(k => rowSelection[k]).map(idx => submissions[parseInt(idx)]?.id).filter(Boolean);

  useEffect(() => { fetchKYC(); }, [filters]);

  async function fetchKYC() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.overdue) params.set('overdue', filters.overdue);
      const res = await apiFetch(`/api/kyc?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setSubmissions(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch { setError('Failed to load KYC submissions.'); }
    finally { setLoading(false); }
  }

  async function handleBatchAction(actionId: string, reason?: string) {
    for (const id of selectedIds) {
      await apiFetch(`/api/kyc/${id}/${actionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason || actionId }) });
    }
    setRowSelection({});
    fetchKYC();
  }

  function getRowActions(row: KYCRow): RowAction[] {
    const actions: RowAction[] = [{ id: 'view', label: 'View Details', icon: <Eye className="h-3.5 w-3.5" />, onClick: () => { setSelectedKYC(row); setPanelOpen(true); } }];
    if (row.status === 'pending' || row.status === 'in_review') {
      actions.push({ id: 'approve', label: 'Approve', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleBatchAction('approve') });
      actions.push({ id: 'resubmit', label: 'Request Reupload', icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => {} });
    }
    return actions;
  }

  const columns: ColumnDef<KYCRow, any>[] = [
    { accessorKey: 'id', header: 'ID', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? v.slice(0, 8) + '…' : '—'; } },
    { accessorKey: 'user_id', header: 'User', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? v.slice(0, 8) + '…' : '—'; } },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => { const s = (getValue() as string | null) ?? ''; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s ? s.replace(/_/g, ' ') : '—'}</span>; } },
    { accessorKey: 'submission_count', header: 'Attempts' },
    { accessorKey: 'overdue', header: 'Overdue', cell: ({ getValue }) => getValue() ? <span className="text-red-600 font-medium">Yes</span> : 'No' },
    { accessorKey: 'created_at', header: 'Submitted', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? new Date(v).toLocaleDateString() : '—'; } },
    { id: 'actions', header: '', cell: ({ row }) => <div className="group"><RowActions actions={getRowActions(row.original)} /></div> },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchKYC} />;

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">KYC Verification Center</h1><p className="text-muted-foreground">Manage identity verification workflows</p></div>
      <FilterBar onClear={() => setFilters({ status: '', overdue: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={[{ label: 'Pending', value: 'pending' }, { label: 'In Review', value: 'in_review' }, { label: 'Approved', value: 'approved' }, { label: 'Rejected', value: 'rejected' }, { label: 'Resubmit', value: 'resubmit_requested' }]} />
        <SelectFilter label="Overdue" value={filters.overdue} onChange={(v) => setFilters(f => ({ ...f, overdue: v }))} options={[{ label: 'Overdue Only', value: 'true' }, { label: 'Not Overdue', value: 'false' }]} />
      </FilterBar>
      {loading ? <LoadingState rows={8} /> : submissions.length === 0 ? <EmptyState message="No KYC submissions match filters." /> : (
        <DataTable columns={columns} data={submissions} pageSize={20} totalCount={totalCount} enableRowSelection onRowSelectionChange={setRowSelection} />
      )}
      <BatchActionBar selectedCount={selectedIds.length} actions={KYC_BATCH_ACTIONS} onAction={handleBatchAction} onClear={() => setRowSelection({})} />
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title="KYC Submission" subtitle={selectedKYC?.id ? selectedKYC.id.slice(0, 12) : undefined}>
        {selectedKYC && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">User</span><span className="font-mono text-xs">{selectedKYC.user_id ? selectedKYC.user_id.slice(0, 12) + '…' : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{selectedKYC.status ? selectedKYC.status.replace(/_/g, ' ') : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Attempts</span><span>{selectedKYC.submission_count}/3</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Overdue</span><span className={selectedKYC.overdue ? 'text-red-600' : ''}>{selectedKYC.overdue ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{selectedKYC.created_at ? new Date(selectedKYC.created_at).toLocaleString() : '—'}</span></div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
