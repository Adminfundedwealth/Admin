'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

interface PurchaseOrderRow {
  id: string;
  order_number: string;
  user_id: string;
  user_email: string;
  product_type: string;
  challenge_type: string | null;
  account_size: number | null;
  amount: number;
  currency: string;
  final_amount: number;
  status: string;
  payment_id: string | null;
  challenge_account_id: string | null;
  created_at: string;
}

interface PurchaseAnalytics {
  totalOrdersToday: number;
  totalRevenueToday: number;
  pendingOrders: number;
  failedOrders: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
};

const columns: ColumnDef<PurchaseOrderRow, any>[] = [
  { accessorKey: 'order_number', header: 'Order #' },
  { accessorKey: 'user_email', header: 'Customer' },
  {
    accessorKey: 'product_type',
    header: 'Product',
    cell: ({ row }) => {
      const type = row.original.product_type;
      const challenge = row.original.challenge_type;
      const size = row.original.account_size;
      const label = challenge ? `${challenge}` : type;
      return (
        <div>
          <span className="capitalize">{label}</span>
          {size && <span className="text-muted-foreground text-xs ml-1">({formatCurrency(size)})</span>}
        </div>
      );
    },
  },
  {
    accessorKey: 'final_amount',
    header: 'Amount',
    cell: ({ row }) => (
      <span className="font-medium">
        {formatCurrency(row.original.final_amount)} <span className="text-xs text-muted-foreground">{row.original.currency}</span>
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string;
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s}</span>;
    },
  },
  {
    accessorKey: 'challenge_account_id',
    header: 'Account Created',
    cell: ({ getValue }) => getValue() ? <span className="text-green-600 text-xs font-medium">✓ Linked</span> : <span className="text-muted-foreground text-xs">—</span>,
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    cell: ({ getValue }) => new Date(getValue() as string).toLocaleString(),
  },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [analytics, setAnalytics] = useState<PurchaseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    productType: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => { fetchOrders(); }, [filters]);

  async function fetchOrders() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.productType) params.set('product_type', filters.productType);
      if (filters.search) params.set('search', filters.search);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      const res = await apiFetch(`/api/purchases?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch purchase orders');
      const json = await res.json();
      setOrders(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
      setAnalytics(json.analytics || null);
    } catch {
      setError('Failed to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setFilters({ status: '', productType: '', search: '', dateFrom: '', dateTo: '' });
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (error) return <ErrorState message={error} onRetry={fetchOrders} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground">
            Customer purchases from fundedwealth.com — order → payment → account creation
          </p>
        </div>
        <ExportButton sourceCenter="purchases" filters={filters} totalCount={totalCount} />
      </div>

      {/* Analytics KPIs */}
      {analytics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Orders Today</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{analytics.totalOrdersToday}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Revenue Today</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{formatCurrency(analytics.totalRevenueToday)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-600">{analytics.pendingOrders}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-600">{analytics.failedOrders}</div></CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { label: 'Pending', value: 'pending' },
            { label: 'Paid', value: 'paid' },
            { label: 'Failed', value: 'failed' },
            { label: 'Refunded', value: 'refunded' },
            { label: 'Cancelled', value: 'cancelled' },
            { label: 'Expired', value: 'expired' },
          ]}
        />
        <SelectFilter
          label="Product"
          value={filters.productType}
          onChange={(v) => setFilters((f) => ({ ...f, productType: v }))}
          options={[
            { label: 'Challenge', value: 'challenge' },
            { label: 'Add-on', value: 'addon' },
            { label: 'Retry', value: 'retry' },
          ]}
        />
        <TextFilter
          label="Search"
          value={filters.search}
          onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          placeholder="Order #, email, or user ID..."
        />
        <DateRangeFilter
          label="Order Date"
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
        />
      </FilterBar>

      {/* Data Table */}
      {loading ? (
        <LoadingState rows={8} />
      ) : orders.length === 0 ? (
        <EmptyState message="No purchase orders match the current filters." />
      ) : (
        <DataTable
          columns={columns}
          data={orders}
          totalCount={totalCount}
          onRowClick={(row) => router.push(`/purchases/${row.id}`)}
        />
      )}
    </div>
  );
}
