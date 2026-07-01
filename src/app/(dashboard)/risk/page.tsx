'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, DateRangeFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar, RISK_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SlidePanel } from '@/components/shared/slide-panel';
import { KPICard } from '@/components/shared/kpi-card';
import { Eye, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskRow {
  id: string;
  alert_type: string;
  severity: string;
  status: string;
  account_id: string;
  account_type: string;
  user_id: string;
  breach_type: string | null;
  breach_amount: number | null;
  created_at: string;
}

// Severity color bar mapping (4px left bar)
const severityBarColor: Record<string, string> = {
  critical: 'border-l-4 border-l-red-500',
  high: 'border-l-4 border-l-orange-500',
  medium: 'border-l-4 border-l-amber-500',
  low: 'border-l-4 border-l-emerald-500',
};

const severityBadge: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500',
  high: 'bg-orange-500/10 text-orange-500',
  medium: 'bg-amber-500/10 text-amber-500',
  low: 'bg-blue-500/10 text-blue-500',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RiskPage() {
  const [alerts, setAlerts] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ severity: '', status: '', dateFrom: '', dateTo: '' });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<RiskRow | null>(null);

  const selectedIds = Object.keys(rowSelection)
    .filter((k) => rowSelection[k])
    .map((idx) => alerts[parseInt(idx)]?.id)
    .filter(Boolean);

  useEffect(() => { fetchAlerts(); }, [filters]);

  async function fetchAlerts() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      const res = await apiFetch(`/api/risk?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setAlerts(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch {
      setError('Failed to load risk alerts.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchAction(actionId: string, reason?: string) {
    for (const id of selectedIds) {
      await apiFetch(`/api/risk/${id}/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || actionId }),
      });
    }
    setRowSelection({});
    fetchAlerts();
  }

  function getRowActions(row: RiskRow): RowAction[] {
    const actions: RowAction[] = [
      { id: 'view', label: 'View', icon: <Eye className="h-3.5 w-3.5" />, onClick: () => { setSelectedAlert(row); setPanelOpen(true); } },
    ];
    if (row.status === 'open') {
      actions.push({ id: 'acknowledge', label: 'Acknowledge', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleBatchAction('acknowledge') });
    }
    if (row.status === 'acknowledged') {
      actions.push({ id: 'resolve', label: 'Resolve', icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleBatchAction('resolve') });
    }
    return actions;
  }

  const columns: ColumnDef<RiskRow, any>[] = [
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return (
          <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-bold uppercase', severityBadge[s])}>
            {s}
          </span>
        );
      },
    },
    { accessorKey: 'alert_type', header: 'Type' },
    { accessorKey: 'breach_type', header: 'Breach', cell: ({ getValue }) => getValue() || '—' },
    {
      accessorKey: 'breach_amount',
      header: 'Amount',
      cell: ({ getValue }) => {
        const val = getValue() as number | null;
        return val ? <span className="tabular-nums font-mono text-[12px]">${val.toLocaleString()}</span> : '—';
      },
    },
    {
      accessorKey: 'account_id',
      header: 'Account',
      cell: ({ getValue }) => (
        <span className="font-mono text-[11px]">{(getValue() as string).slice(0, 8)}...</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <span className="capitalize text-[12px]">{getValue() as string}</span>,
    },
    {
      accessorKey: 'created_at',
      header: 'Generated',
      cell: ({ getValue }) => {
        const d = new Date(getValue() as string);
        return <span className="text-[11px] text-muted-foreground tabular-nums">{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <RowActions actions={getRowActions(row.original)} />,
    },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchAlerts} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Risk Management Center</h1>
          <p className="text-[11px] text-muted-foreground">
            Drawdown breaches, rule violations, trading anomalies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskScore alerts={alerts} />
        </div>
      </div>

      {/* Capital Exposure Bar */}
      <CapitalExposureBar />

      {/* Risk Heatmap */}
      <RiskHeatmap />

      {/* Filters */}
      <FilterBar
        onClear={() => setFilters({ severity: '', status: '', dateFrom: '', dateTo: '' })}
        hasActiveFilters={Object.values(filters).some(Boolean)}
      >
        <SelectFilter
          label="Severity"
          value={filters.severity}
          onChange={(v) => setFilters((f) => ({ ...f, severity: v }))}
          options={[
            { label: 'Critical', value: 'critical' },
            { label: 'High', value: 'high' },
            { label: 'Medium', value: 'medium' },
            { label: 'Low', value: 'low' },
          ]}
        />
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { label: 'Open', value: 'open' },
            { label: 'Acknowledged', value: 'acknowledged' },
            { label: 'Resolved', value: 'resolved' },
          ]}
        />
        <DateRangeFilter
          label="Date"
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
        />
      </FilterBar>

      {/* Table */}
      {loading ? (
        <LoadingState rows={8} />
      ) : alerts.length === 0 ? (
        <EmptyState message="No risk alerts match filters." />
      ) : (
        <DataTable
          columns={columns}
          data={alerts}
          tableId="risk-alerts"
          pageSize={20}
          totalCount={totalCount}
          enableRowSelection
          onRowSelectionChange={setRowSelection}
          onRowClick={(row) => { setSelectedAlert(row); setPanelOpen(true); }}
        />
      )}

      {/* Batch Actions */}
      <BatchActionBar
        selectedCount={selectedIds.length}
        actions={RISK_BATCH_ACTIONS}
        onAction={handleBatchAction}
        onClear={() => setRowSelection({})}
      />

      {/* Slide Panel */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Risk Alert" subtitle={selectedAlert?.alert_type}>
        {selectedAlert && (
          <div className="space-y-4">
            {/* Severity bar */}
            <div className={cn('rounded-md p-3 border', severityBarColor[selectedAlert.severity])}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Severity</span>
                <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-bold uppercase', severityBadge[selectedAlert.severity])}>
                  {selectedAlert.severity}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div><span className="text-muted-foreground text-[11px]">Type</span><p className="font-medium">{selectedAlert.alert_type}</p></div>
              <div><span className="text-muted-foreground text-[11px]">Breach</span><p className="font-medium">{selectedAlert.breach_type || '—'}</p></div>
              <div><span className="text-muted-foreground text-[11px]">Amount</span><p className="font-medium tabular-nums">{selectedAlert.breach_amount ? `$${selectedAlert.breach_amount.toLocaleString()}` : '—'}</p></div>
              <div><span className="text-muted-foreground text-[11px]">Status</span><p className="font-medium capitalize">{selectedAlert.status}</p></div>
              <div><span className="text-muted-foreground text-[11px]">Account</span><p className="font-mono text-[11px]">{selectedAlert.account_id}</p></div>
              <div><span className="text-muted-foreground text-[11px]">User</span><p className="font-mono text-[11px]">{selectedAlert.user_id}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground text-[11px]">Generated</span><p className="font-medium">{new Date(selectedAlert.created_at).toLocaleString()}</p></div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Heatmap — accounts by size tier vs drawdown usage
// ---------------------------------------------------------------------------

function RiskHeatmap() {
  const [heatmapData, setHeatmapData] = useState<number[][]>([]);

  useEffect(() => {
    fetchHeatmap();
  }, []);

  async function fetchHeatmap() {
    try {
      const res = await apiFetch('/api/risk/heatmap');
      if (res.ok) {
        const data = await res.json();
        setHeatmapData(data.grid ?? []);
      }
    } catch {}
  }

  // Default grid if no data
  const grid = heatmapData.length > 0 ? heatmapData : [
    [0, 0, 1, 0],
    [0, 2, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  const sizeLabels = ['$10K', '$25K', '$50K', '$100K+'];
  const drawdownLabels = ['0-25%', '25-50%', '50-75%', '75-100%'];

  function cellColor(count: number): string {
    if (count === 0) return 'bg-emerald-500/10';
    if (count <= 2) return 'bg-amber-500/20';
    if (count <= 5) return 'bg-amber-500/40';
    return 'bg-red-500/40';
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Risk Heatmap</h3>
        <span className="text-[10px] text-muted-foreground">Account Size × Drawdown Usage</span>
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `60px repeat(${sizeLabels.length}, 1fr)` }}>
        {/* Header row */}
        <div />
        {sizeLabels.map((label) => (
          <div key={label} className="text-[9px] text-center text-muted-foreground font-medium py-1">{label}</div>
        ))}

        {/* Data rows */}
        {grid.map((row, rowIdx) => (
          <>
            <div key={`label-${rowIdx}`} className="text-[9px] text-muted-foreground font-medium flex items-center">
              {drawdownLabels[rowIdx]}
            </div>
            {row.map((count, colIdx) => (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={cn('h-8 rounded-sm flex items-center justify-center text-[10px] font-bold tabular-nums', cellColor(count))}
                title={`${count} accounts — ${sizeLabels[colIdx]} at ${drawdownLabels[rowIdx]} drawdown`}
              >
                {count > 0 ? count : ''}
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capital Exposure Bar
// ---------------------------------------------------------------------------

function CapitalExposureBar() {
  const [exposure, setExposure] = useState({ atRisk: 0, deployed: 0, ratio: 0 });

  useEffect(() => {
    fetchExposure();
    const interval = setInterval(fetchExposure, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchExposure() {
    try {
      const res = await apiFetch('/api/risk/exposure');
      if (res.ok) setExposure(await res.json());
    } catch {}
  }

  const color = exposure.ratio < 5 ? 'text-emerald-500' : exposure.ratio < 15 ? 'text-amber-500' : 'text-red-500';
  const barColor = exposure.ratio < 5 ? 'bg-emerald-500' : exposure.ratio < 15 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Capital Exposure</h3>
        <span className={cn('text-sm font-bold tabular-nums', color)}>{exposure.ratio.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-2">
        <span>At Risk: <strong className="text-foreground tabular-nums">${exposure.atRisk.toLocaleString()}</strong></span>
        <span>Deployed: <strong className="text-foreground tabular-nums">${exposure.deployed.toLocaleString()}</strong></span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.min(exposure.ratio, 100)}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Score indicator
// ---------------------------------------------------------------------------

function RiskScore({ alerts }: { alerts: RiskRow[] }) {
  const openAlerts = alerts.filter((a) => a.status === 'open');
  const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
  const highCount = openAlerts.filter((a) => a.severity === 'high').length;

  // Simple score: critical*25 + high*10 + medium*3 + low*1 (capped at 100)
  const score = Math.min(100,
    criticalCount * 25 +
    highCount * 10 +
    openAlerts.filter((a) => a.severity === 'medium').length * 3 +
    openAlerts.filter((a) => a.severity === 'low').length
  );

  const color = score <= 25 ? 'text-emerald-500' : score <= 50 ? 'text-amber-500' : score <= 75 ? 'text-orange-500' : 'text-red-500';
  const ringColor = score <= 25 ? 'stroke-emerald-500' : score <= 50 ? 'stroke-amber-500' : score <= 75 ? 'stroke-orange-500' : 'stroke-red-500';

  return (
    <div className="flex items-center gap-2" title={`Risk Score: ${score}/100`}>
      <svg width="32" height="32" className="-rotate-90">
        <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
        <circle
          cx="16" cy="16" r="12" fill="none" strokeWidth="3"
          strokeDasharray={`${(score / 100) * 75.4} 75.4`}
          strokeLinecap="round"
          className={ringColor}
        />
      </svg>
      <span className={cn('text-sm font-bold tabular-nums', color)}>{score}</span>
    </div>
  );
}
