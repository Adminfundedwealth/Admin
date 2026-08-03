'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect, useCallback } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, DateRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar, PAYOUT_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SlidePanel } from '@/components/shared/slide-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle, XCircle, Eye, FileText } from 'lucide-react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

interface PayoutRow {
  id: string;
  user_id: string;
  funded_account_id: string;
  requested_amount: number;
  calculated_payout: number;
  profit_share_pct: number;
  status: string;
  eligibility_status: string;
  created_at: string;
  completed_at: string | null;
}

interface PayoutAnalytics {
  totalPaidMonthly: number;
  totalPending: number;
  avgProcessingTimeHours: number;
  rejectionRate: number;
}

const statusColors: Record<string, string> = {
  request_received: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  payment_processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  payment_completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  payment_failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [analytics, setAnalytics] = useState<PayoutAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', dateFrom: '', dateTo: '' });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<PayoutRow | null>(null);

  const selectedIds = Object.keys(rowSelection).filter(k => rowSelection[k]).map(idx => payouts[parseInt(idx)]?.id).filter(Boolean);

  useEffect(() => { fetchPayouts(); }, [filters]);

  async function fetchPayouts() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      const res = await apiFetch(`/api/payouts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setPayouts(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
      setAnalytics(json.analytics || null);
    } catch { setError('Failed to load payouts.'); }
    finally { setLoading(false); }
  }

  // Batch action handler
  async function handleBatchAction(actionId: string, reason?: string) {
    for (const id of selectedIds) {
      await apiFetch(`/api/payouts/${id}/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || actionId }),
      });
    }
    setRowSelection({});
    fetchPayouts();
  }

  // Inline row actions
  function getRowActions(row: PayoutRow): RowAction[] {
    return [
      { id: 'view', label: 'View Details', icon: <Eye className="h-3.5 w-3.5" />, onClick: () => { setSelectedPayout(row); setPanelOpen(true); } },
      ...(row.status === 'under_review' ? [{ id: 'approve', label: 'Approve', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleSingleAction(row.id, 'approve') }] : []),
      ...(['request_received', 'under_review'].includes(row.status) ? [{ id: 'reject', label: 'Reject', icon: <XCircle className="h-3.5 w-3.5" />, variant: 'destructive' as const, onClick: () => handleSingleAction(row.id, 'reject') }] : []),
    ];
  }

  async function handleSingleAction(id: string, action: string) {
    await apiFetch(`/api/payouts/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: action }) });
    fetchPayouts();
  }

  const columns: ColumnDef<PayoutRow, any>[] = [
    { accessorKey: 'id', header: 'ID', cell: ({ getValue }) => (getValue() as string).slice(0, 8) + '...' },
    { accessorKey: 'requested_amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'calculated_payout', header: 'Payout', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'profit_share_pct', header: 'Split', cell: ({ getValue }) => `${getValue()}%` },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => { const s = getValue() as string; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s.replace(/_/g, ' ')}</span>; } },
    { accessorKey: 'eligibility_status', header: 'Eligible', cell: ({ getValue }) => <span className={getValue() === 'eligible' ? 'text-green-600' : 'text-red-500'}>{getValue() as string}</span> },
    { accessorKey: 'created_at', header: 'Requested', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
    { id: 'actions', header: '', cell: ({ row }) => <div className="group"><RowActions actions={getRowActions(row.original)} /></div> },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchPayouts} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payout Operations Center</h1>
          <p className="text-muted-foreground">Manage the complete payout lifecycle with full audit trails</p>
        </div>
        <ExportButton sourceCenter="payouts" filters={filters} totalCount={totalCount} />
      </div>

      {analytics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Paid (Monthly)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(analytics.totalPaidMonthly)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600">{formatCurrency(analytics.totalPending)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Processing</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{analytics.avgProcessingTimeHours.toFixed(1)}h</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rejection Rate</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{analytics.rejectionRate.toFixed(1)}%</div></CardContent></Card>
        </div>
      )}

      <FilterBar onClear={() => setFilters({ status: '', dateFrom: '', dateTo: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))}
          options={[{ label: 'Request Received', value: 'request_received' }, { label: 'Under Review', value: 'under_review' }, { label: 'Approved', value: 'approved' }, { label: 'Processing', value: 'payment_processing' }, { label: 'Completed', value: 'payment_completed' }, { label: 'Failed', value: 'payment_failed' }]} />
        <DateRangeFilter label="Request Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
      </FilterBar>

      {loading ? <LoadingState rows={8} /> : payouts.length === 0 ? (
        <EmptyState message="No payout requests match the current filters." />
      ) : (
        <DataTable columns={columns} data={payouts} pageSize={20} totalCount={totalCount} enableRowSelection onRowSelectionChange={setRowSelection} />
      )}

      {/* Batch Action Bar */}
      <BatchActionBar selectedCount={selectedIds.length} actions={PAYOUT_BATCH_ACTIONS} onAction={handleBatchAction} onClear={() => setRowSelection({})} />

      {/* Slide Panel */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Payout Details" subtitle={selectedPayout?.id.slice(0, 12)}>
        {selectedPayout && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatCurrency(selectedPayout.requested_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payout</span><span className="font-medium">{formatCurrency(selectedPayout.calculated_payout)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Split</span><span>{selectedPayout.profit_share_pct}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{selectedPayout.status.replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Eligibility</span><span>{selectedPayout.eligibility_status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{selectedPayout.user_id?.slice(0, 12)}...</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Funded Account</span><span className="font-mono text-xs">{selectedPayout.funded_account_id?.slice(0, 12)}...</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Requested</span><span>{new Date(selectedPayout.created_at).toLocaleString()}</span></div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
