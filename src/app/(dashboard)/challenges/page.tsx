'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar, CHALLENGE_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SlidePanel } from '@/components/shared/slide-panel';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { Eye, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

interface ChallengeRow {
  id: string; account_number: string; user_id: string; challenge_type: string; phase: number; status: string;
  initial_balance: number; profit_pct: number; max_drawdown_pct: number; trading_days_completed: number; min_trading_days: number; started_at: string;
}

const statusColors: Record<string, string> = { active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', passed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' };

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', type: '', dateFrom: '', dateTo: '', user: '' });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeRow | null>(null);

  const selectedIds = Object.keys(rowSelection).filter(k => rowSelection[k]).map(idx => challenges[parseInt(idx)]?.id).filter(Boolean);

  useEffect(() => { fetchChallenges(); }, [filters]);

  async function fetchChallenges() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('challenge_type', filters.type);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.user) params.set('user', filters.user);
      const res = await fetch(`/api/challenges?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setChallenges(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch { setError('Failed to load challenges.'); }
    finally { setLoading(false); }
  }

  async function handleBatchAction(actionId: string, reason?: string) {
    for (const id of selectedIds) {
      await fetch(`/api/challenges/${id}/${actionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason || actionId }) });
    }
    setRowSelection({});
    fetchChallenges();
  }

  async function handleSingleAction(id: string, action: string) {
    await fetch(`/api/challenges/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: `Inline ${action} action` }) });
    fetchChallenges();
  }

  function getRowActions(row: ChallengeRow): RowAction[] {
    const actions: RowAction[] = [{ id: 'view', label: 'View Details', icon: <Eye className="h-3.5 w-3.5" />, onClick: () => { setSelectedChallenge(row); setPanelOpen(true); } }];
    if (row.status === 'active') {
      actions.push({ id: 'pass', label: 'Pass', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleSingleAction(row.id, 'pass') });
      actions.push({ id: 'fail', label: 'Fail', icon: <XCircle className="h-3.5 w-3.5" />, variant: 'destructive', onClick: () => handleSingleAction(row.id, 'fail') });
    }
    if (['failed', 'expired'].includes(row.status)) {
      actions.push({ id: 'reset', label: 'Reset', icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => handleSingleAction(row.id, 'reset') });
    }
    return actions;
  }

  const columns: ColumnDef<ChallengeRow, any>[] = [
    { accessorKey: 'account_number', header: 'Account' },
    { accessorKey: 'challenge_type', header: 'Type' },
    { accessorKey: 'phase', header: 'Phase', cell: ({ getValue }) => `Phase ${getValue()}` },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => { const s = getValue() as string; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s}</span>; } },
    { accessorKey: 'initial_balance', header: 'Size', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'profit_pct', header: 'Profit', cell: ({ getValue }) => formatPercentage(getValue() as number) },
    { accessorKey: 'max_drawdown_pct', header: 'Max DD', cell: ({ getValue }) => formatPercentage(getValue() as number) },
    { accessorKey: 'trading_days_completed', header: 'Days', cell: ({ row }) => `${row.original.trading_days_completed}/${row.original.min_trading_days}` },
    { accessorKey: 'started_at', header: 'Started', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
    { id: 'actions', header: '', cell: ({ row }) => <div className="group"><RowActions actions={getRowActions(row.original)} /></div> },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchChallenges} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Challenge Operations Center</h1><p className="text-muted-foreground">Manage the complete lifecycle of every challenge account</p></div>
        <ExportButton sourceCenter="challenges" filters={filters} totalCount={totalCount} />
      </div>
      <FilterBar onClear={() => setFilters({ status: '', type: '', dateFrom: '', dateTo: '', user: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={[{ label: 'Active', value: 'active' }, { label: 'Passed', value: 'passed' }, { label: 'Failed', value: 'failed' }, { label: 'Expired', value: 'expired' }, { label: 'Archived', value: 'archived' }]} />
        <TextFilter label="Type" value={filters.type} onChange={(v) => setFilters(f => ({ ...f, type: v }))} placeholder="e.g. Standard 100K" />
        <TextFilter label="User" value={filters.user} onChange={(v) => setFilters(f => ({ ...f, user: v }))} placeholder="Email or ID" />
        <DateRangeFilter label="Start Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
      </FilterBar>
      {loading ? <LoadingState rows={8} /> : challenges.length === 0 ? <EmptyState message="No challenges match filters." /> : (
        <DataTable columns={columns} data={challenges} pageSize={20} totalCount={totalCount} enableRowSelection onRowSelectionChange={setRowSelection} />
      )}
      <BatchActionBar selectedCount={selectedIds.length} actions={CHALLENGE_BATCH_ACTIONS} onAction={handleBatchAction} onClear={() => setRowSelection({})} />
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={selectedChallenge?.account_number || ''} subtitle={selectedChallenge?.challenge_type}>
        {selectedChallenge && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{selectedChallenge.status}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{formatCurrency(selectedChallenge.initial_balance)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className={selectedChallenge.profit_pct >= 0 ? 'text-green-600' : 'text-red-600'}>{formatPercentage(selectedChallenge.profit_pct)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Max DD</span><span>{formatPercentage(selectedChallenge.max_drawdown_pct)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Trading Days</span><span>{selectedChallenge.trading_days_completed}/{selectedChallenge.min_trading_days}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span>{new Date(selectedChallenge.started_at).toLocaleDateString()}</span></div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
