'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import type { ColumnDef } from '@tanstack/react-table';

interface OrderRow { id: string; account_id: string; symbol: string; order_type: string; direction: string; volume: number; price: number | null; status: string; rejection_reason: string | null; acknowledged: boolean; submitted_at: string; executed_at: string | null; }

const statusColors: Record<string, string> = { open: 'bg-blue-100 text-blue-800', filled: 'bg-green-100 text-green-800', cancelled: 'bg-gray-100 text-gray-800', rejected: 'bg-red-100 text-red-800' };

const columns: ColumnDef<OrderRow, any>[] = [
  { accessorKey: 'account_id', header: 'Account', cell: ({ getValue }) => (getValue() as string).slice(0, 8) + '...' },
  { accessorKey: 'symbol', header: 'Symbol' },
  { accessorKey: 'order_type', header: 'Type', cell: ({ getValue }) => (getValue() as string).replace(/_/g, ' ') },
  { accessorKey: 'direction', header: 'Side', cell: ({ getValue }) => <span className={getValue() === 'buy' ? 'text-green-600' : 'text-red-600'}>{(getValue() as string).toUpperCase()}</span> },
  { accessorKey: 'volume', header: 'Volume' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => { const s = getValue() as string; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s}</span>; } },
  { accessorKey: 'rejection_reason', header: 'Rejection', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'submitted_at', header: 'Submitted', cell: ({ getValue }) => new Date(getValue() as string).toLocaleString() },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ status: '', symbol: '', orderType: '', dateFrom: new Date().toISOString().slice(0, 10), dateTo: '' });

  useEffect(() => { fetchOrders(); }, [filters]);

  async function fetchOrders() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.symbol) params.set('symbol', filters.symbol);
      if (filters.orderType) params.set('order_type', filters.orderType);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setOrders(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch { setError('Failed to load orders.'); }
    finally { setLoading(false); }
  }

  if (error) return <ErrorState message={error} onRetry={fetchOrders} />;

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Trading Order Monitoring</h1><p className="text-muted-foreground">Track trading execution orders and investigate rejections (terminal/trading layer)</p></div>
      <FilterBar onClear={() => setFilters({ status: '', symbol: '', orderType: '', dateFrom: '', dateTo: '' })} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={[{ label: 'Open', value: 'open' }, { label: 'Filled', value: 'filled' }, { label: 'Cancelled', value: 'cancelled' }, { label: 'Rejected', value: 'rejected' }]} />
        <TextFilter label="Symbol" value={filters.symbol} onChange={(v) => setFilters(f => ({ ...f, symbol: v }))} placeholder="e.g. EURUSD" />
        <SelectFilter label="Type" value={filters.orderType} onChange={(v) => setFilters(f => ({ ...f, orderType: v }))} options={[{ label: 'Market', value: 'market' }, { label: 'Limit', value: 'limit' }, { label: 'Stop', value: 'stop' }, { label: 'Stop Limit', value: 'stop_limit' }]} />
        <DateRangeFilter label="Date" from={filters.dateFrom} to={filters.dateTo} onFromChange={(v) => setFilters(f => ({ ...f, dateFrom: v }))} onToChange={(v) => setFilters(f => ({ ...f, dateTo: v }))} />
      </FilterBar>
      {loading ? <LoadingState rows={10} /> : orders.length === 0 ? <EmptyState message="No orders found for the selected criteria." /> : <DataTable columns={columns} data={orders} pageSize={50} totalCount={totalCount} />}
    </div>
  );
}
