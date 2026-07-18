'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter, NumberRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

interface TradeRow { id: string; account_id: string; symbol: string; direction: string; lot_size: number; entry_price: number; exit_price: number | null; profit_loss: number | null; status: string; opened_at: string; closed_at: string | null; duration_seconds: number | null; }

const columns: ColumnDef<TradeRow, any>[] = [
  { accessorKey: 'account_id', header: 'Account', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? v.slice(0, 8) + '…' : '—'; } },
  { accessorKey: 'symbol', header: 'Symbol', cell: ({ getValue }) => (getValue() as string | null) || '—' },
  { accessorKey: 'direction', header: 'Direction', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? <span className={v === 'buy' ? 'text-green-600' : 'text-red-600'}>{v.toUpperCase()}</span> : '—'; } },
  { accessorKey: 'lot_size', header: 'Lots' },
  { accessorKey: 'entry_price', header: 'Entry' },
  { accessorKey: 'exit_price', header: 'Exit', cell: ({ getValue }) => getValue() ?? '—' },
  { accessorKey: 'profit_loss', header: 'P&L', cell: ({ getValue }) => { const v = getValue() as number | null; return v !== null ? <span className={v >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(v)}</span> : '—'; } },
  { accessorKey: 'duration_seconds', header: 'Duration', cell: ({ getValue }) => { const s = getValue() as number | null; if (!s) return '—'; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; } },
  { accessorKey: 'opened_at', header: 'Opened', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? new Date(v).toLocaleString() : '—'; } },
];

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ symbol: '', direction: '', dateFrom: '', dateTo: '', pnlMin: '', pnlMax: '' });

  useEffect(() => { fetchTrades(); }, [filters]);

  async function fetchTrades() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.symbol) params.set('symbol', filters.symbol);
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.pnlMin) params.set('pnl_min', filters.pnlMin);
      if (filters.pnlMax) params.set('pnl_max', filters.pnlMax);
      const res = await apiFetch(`/api/trades?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setTrades(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch { setError('Failed to load trades.'); }
    finally { setLoading(false); }
  }

  if (error) return <ErrorState message={error} onRetry={fetchTrades} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Trade Surveillance Center</h1><p className="text-muted-foreground">Monitor all trades with advanced filtering</p></div>
        <ExportButton sourceCenter="trades" filters={filters} totalCount={totalCount} />
      </div>
      <FilterBar onClear={() => setFilters({ symbol: '', direction: '', dateFrom: '', dateTo: '', pnlMin: '', pnlMax: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <TextFilter label="Symbol" value={filters.symbol} onChange={(v) => setFilters(f => ({ ...f, symbol: v }))} placeholder="e.g. EURUSD" />
        <SelectFilter label="Direction" value={filters.direction} onChange={(v) => setFilters(f => ({ ...f, direction: v }))} options={[{ label: 'Buy', value: 'buy' }, { label: 'Sell', value: 'sell' }]} />
        <DateRangeFilter label="Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
        <NumberRangeFilter label="P&L Range" min={filters.pnlMin} max={filters.pnlMax} onMinChange={(v) => setFilters(f => ({ ...f, pnlMin: v }))} onMaxChange={(v) => setFilters(f => ({ ...f, pnlMax: v }))} />
      </FilterBar>
      {loading ? <LoadingState rows={10} /> : trades.length === 0 ? <EmptyState message="No trades match the current filter criteria." /> : <DataTable columns={columns} data={trades} pageSize={50} pageSizeOptions={[50, 100, 200]} totalCount={totalCount} />}
    </div>
  );
}
