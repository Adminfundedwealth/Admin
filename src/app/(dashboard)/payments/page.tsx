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

interface PaymentRow {
  id: string;
  user_id: string;
  user_email: string;
  purchase_order_id: string;
  order_number: string;
  provider: string;
  provider_transaction_id: string | null;
  amount: number;
  currency: string;
  fee: number;
  net_amount: number;
  status: string;
  payment_method_type: string | null;
  payment_method_last4: string | null;
  is_manual: boolean;
  created_at: string;
}

interface PaymentAnalytics {
  totalCollectedToday: number;
  totalFeesToday: number;
  failedCount: number;
  disputedCount: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  succeeded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  partially_refunded: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  disputed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const columns: ColumnDef<PaymentRow, any>[] = [
  { accessorKey: 'order_number', header: 'Order #' },
  { accessorKey: 'user_email', header: 'Customer' },
  {
    accessorKey: 'provider',
    header: 'Provider',
    cell: ({ row }) => (
      <span className="capitalize">
        {row.original.provider}
        {row.original.is_manual && <span className="ml-1 text-xs text-muted-foreground">(manual)</span>}
      </span>
    ),
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.amount)}</span>,
  },
  {
    accessorKey: 'fee',
    header: 'Fee',
    cell: ({ getValue }) => <span className="text-muted-foreground">{formatCurrency(getValue() as number)}</span>,
  },
  {
    accessorKey: 'net_amount',
    header: 'Net',
    cell: ({ getValue }) => <span className="font-medium text-green-600">{formatCurrency(getValue() as number)}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string;
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[s] || ''}`}>{s.replace(/_/g, ' ')}</span>;
    },
  },
  {
    accessorKey: 'payment_method_type',
    header: 'Method',
    cell: ({ row }) => {
      const type = row.original.payment_method_type;
      const last4 = row.original.payment_method_last4;
      if (!type) return '—';
      return <span className="text-xs">{type}{last4 ? ` •••• ${last4}` : ''}</span>;
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    cell: ({ getValue }) => new Date(getValue() as string).toLocaleString(),
  },
];

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [analytics, setAnalytics] = useState<PaymentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    provider: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => { fetchPayments(); }, [filters]);

  async function fetchPayments() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.provider) params.set('provider', filters.provider);
      if (filters.search) params.set('search', filters.search);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      const res = await apiFetch(`/api/payments?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payments');
      const json = await res.json();
      setPayments(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
      setAnalytics(json.analytics || null);
    } catch {
      setError('Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setFilters({ status: '', provider: '', search: '', dateFrom: '', dateTo: '' });
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (error) return <ErrorState message={error} onRetry={fetchPayments} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Customer payment transactions from fundedwealth.com purchases
          </p>
        </div>
        <ExportButton sourceCenter="payments" filters={filters} totalCount={totalCount} />
      </div>

      {/* Analytics KPIs */}
      {analytics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Collected Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(analytics.totalCollectedToday)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Fees Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{formatCurrency(analytics.totalFeesToday)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{analytics.failedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Disputed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{analytics.disputedCount}</div>
            </CardContent>
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
            { label: 'Processing', value: 'processing' },
            { label: 'Succeeded', value: 'succeeded' },
            { label: 'Failed', value: 'failed' },
            { label: 'Refunded', value: 'refunded' },
            { label: 'Disputed', value: 'disputed' },
          ]}
        />
        <SelectFilter
          label="Provider"
          value={filters.provider}
          onChange={(v) => setFilters((f) => ({ ...f, provider: v }))}
          options={[
            { label: 'Stripe', value: 'stripe' },
            { label: 'Razorpay', value: 'razorpay' },
            { label: 'Manual', value: 'manual' },
            { label: 'Crypto', value: 'crypto' },
          ]}
        />
        <TextFilter
          label="Search"
          value={filters.search}
          onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          placeholder="Transaction ID, email, or order #..."
        />
        <DateRangeFilter
          label="Date"
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
        />
      </FilterBar>

      {/* Data Table */}
      {loading ? (
        <LoadingState rows={8} />
      ) : payments.length === 0 ? (
        <EmptyState message="No payments match the current filters." />
      ) : (
        <DataTable
          columns={columns}
          data={payments}
          totalCount={totalCount}
          onRowClick={(row) => router.push(`/payments/${row.id}`)}
        />
      )}
    </div>
  );
}
