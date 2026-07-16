'use client';
import { apiFetch } from '@/lib/api/fetch';

import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, DateRangeFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar, RISK_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { SlidePanel } from '@/components/shared/slide-panel';
import { Eye, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

// ---------------------------------------------------------------------------
// Types — matches actual risk_events table columns
// ---------------------------------------------------------------------------

interface RiskRow {
  id: string;
  trading_account_id: string | null;
  challenge_id: string | null;
  event_type: string | null;
  severity: string;
  rule_type: string | null;
  threshold_value: number | null;
  actual_value: number | null;
  metadata: Record<string, unknown> | null;
  acknowledged: boolean;
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

  useEffect(() => { fetchAlerts(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {
        id: 'view',
        label: 'View',
        icon: <Eye className="h-3.5 w-3.5" />,
        onClick: () => { setSelectedAlert(row); setPanelOpen(true); },
      },
    ];
    // Use acknowledged boolean to derive status for row actions
    if (!row.acknowledged) {
      actions.push({
        id: 'acknowledge',
        label: 'Acknowledge',
        icon: <CheckCircle className="h-3.5 w-3.5" />,
        onClick: () => handleBatchAction('acknowledge'),
      });
    }
    return actions;
  }

  const columns: ColumnDef<RiskRow, unknown>[] = [
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ getValue }) => {
        const s = (getValue() as string) ?? '';
        return (
          <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-bold uppercase', severityBadge[s] ?? 'bg-muted text-muted-foreground')}>
            {s || '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'event_type',
      header: 'Type',
      cell: ({ getValue }) => <span className="text-[12px]">{(getValue() as string) || '—'}</span>,
    },
    {
      accessorKey: 'rule_type',
      header: 'Rule',
      cell: ({ getValue }) => <span className="text-[12px]">{(getValue() as string) || '—'}</span>,
    },
    {
      accessorKey: 'threshold_value',
      header: 'Threshold',
      cell: ({ getValue }) => {
        const val = getValue() as number | null;
        return val != null ? (
          <span className="tabular-nums font-mono text-[12px]">{val.toLocaleString()}</span>
        ) : '—';
      },
    },
    {
      accessorKey: 'actual_value',
      header: 'Actual',
      cell: ({ getValue }) => {
        const val = getValue() as number | null;
        return val != null ? (
          <span className="tabular-nums font-mono text-[12px]">{val.toLocaleString()}</span>
        ) : '—';
      },
    },
    {
      accessorKey: 'trading_account_id',
      header: 'Account',
      cell: ({ getValue }) => {
        const val = getValue() as string | null;
        return val ? (
          <span className="font-mono text-[11px]">{val.slice(0, 8)}…</span>
        ) : '—';
      },
    },
    {
      accessorKey: 'acknowledged',
      header: 'Status',
      cell: ({ getValue }) => {
        const ack = getValue() as boolean;
        return (
          <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-semibold capitalize', ack ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600')}>
            {ack ? 'Acknowledged' : 'Open'}
          </span>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Generated',
      cell: ({ getValue }) => {
        const val = getValue() as string;
        if (!val) return '—';
        const d = new Date(val);
        return (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        );
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
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Risk Alert"
        subtitle={selectedAlert?.event_type ?? undefined}
      >
        {selectedAlert && (
          <div className="space-y-4">
            {/* Severity bar */}
            <div className={cn('rounded-md p-3 border', severityBarColor[selectedAlert.severity] ?? '')}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Severity</span>
                <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-bold uppercase', severityBadge[selectedAlert.severity] ?? 'bg-muted text-muted-foreground')}>
                  {selectedAlert.severity}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <span className="text-muted-foreground text-[11px]">Event Type</span>
                <p className="font-medium">{selectedAlert.event_type || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Rule Type</span>
                <p className="font-medium">{selectedAlert.rule_type || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Threshold</span>
                <p className="font-medium tabular-nums">
                  {selectedAlert.threshold_value != null ? selectedAlert.threshold_value.toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Actual Value</span>
                <p className="font-medium tabular-nums">
                  {selectedAlert.actual_value != null ? selectedAlert.actual_value.toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Status</span>
                <p className="font-medium capitalize">{selectedAlert.acknowledged ? 'Acknowledged' : 'Open'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Account</span>
                <p className="font-mono text-[11px]">{selectedAlert.trading_account_id || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Challenge</span>
                <p className="font-mono text-[11px]">{selectedAlert.challenge_id || '—'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground text-[11px]">Generated</span>
                <p className="font-medium">{new Date(selectedAlert.created_at).toLocaleString()}</p>
              </div>
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
  const grid: number[][] = heatmapData.length > 0 ? heatmapData : [
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

        {/* Data rows — use React.Fragment with key instead of bare <> to avoid crash */}
        {grid.map((row, rowIdx) => (
          <React.Fragment key={`row-${rowIdx}`}>
            <div className="text-[9px] text-muted-foreground font-medium flex items-center">
              {drawdownLabels[rowIdx] ?? ''}
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
          </React.Fragment>
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
  // Derive open alerts from acknowledged boolean (acknowledged=false means open)
  const openAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
  const highCount = openAlerts.filter((a) => a.severity === 'high').length;

  // Simple score: critical*25 + high*10 + medium*3 + low*1 (capped at 100)
  const score = Math.min(
    100,
    criticalCount * 25 +
    highCount * 10 +
    openAlerts.filter((a) => a.severity === 'medium').length * 3 +
    openAlerts.filter((a) => a.severity === 'low').length,
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
