'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { DateRangeFilter, FilterBar, SelectFilter, TextFilter } from '@/components/shared/filters';
import { LoadingState } from '@/components/shared/loading-state';
import { apiFetch } from '@/lib/api/fetch';
import { formatFullTimestamp } from '@/lib/format-time';

interface TradingAccount {
  id: string;
  account_code: string | null;
  broker_provider: string | null;
  balance: number | string | null;
  available_margin: number | string | null;
  used_margin: number | string | null;
  status: string;
  locked_reason: string | null;
  created_at: string;
}

interface TradingAccountsResponse {
  data: TradingAccount[];
  meta: { totalCount: number };
}

interface Filters {
  status: string;
  accountCode: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: Filters = { status: '', accountCode: '', dateFrom: '', dateTo: '' };
const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-800',
  locked: 'bg-red-100 text-red-800',
};

function isTradingAccount(value: unknown): value is TradingAccount {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const isNullableString = (item: unknown) => item === null || typeof item === 'string';
  const isAmount = (item: unknown) => item === null || typeof item === 'number' || typeof item === 'string';
  return (
    typeof row.id === 'string' &&
    isNullableString(row.account_code) &&
    isNullableString(row.broker_provider) &&
    isAmount(row.balance) &&
    isAmount(row.available_margin) &&
    isAmount(row.used_margin) &&
    typeof row.status === 'string' &&
    isNullableString(row.locked_reason) &&
    typeof row.created_at === 'string'
  );
}

function isTradingAccountsResponse(value: unknown): value is TradingAccountsResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.data) || !response.data.every(isTradingAccount)) return false;
  if (!response.meta || typeof response.meta !== 'object' || Array.isArray(response.meta)) return false;
  const meta = response.meta as Record<string, unknown>;
  return typeof meta.totalCount === 'number' && Number.isFinite(meta.totalCount);
}

function formatAmount(value: number | string | null): string {
  if (value === null || (typeof value === 'string' && !value.trim())) return '—';
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

const columns: ColumnDef<TradingAccount>[] = [
  { accessorKey: 'account_code', header: 'Account Code', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'broker_provider', header: 'Broker', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => formatAmount(row.original.balance) },
  { accessorKey: 'available_margin', header: 'Available Margin', cell: ({ row }) => formatAmount(row.original.available_margin) },
  { accessorKey: 'used_margin', header: 'Used Margin', cell: ({ row }) => formatAmount(row.original.used_margin) },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[status.toLowerCase()] || 'bg-muted text-muted-foreground'}`}>{status || '—'}</span>;
    },
  },
  { accessorKey: 'locked_reason', header: 'Lock Reason', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'created_at', header: 'Created', cell: ({ row }) => formatFullTimestamp(row.original.created_at) },
];

export default function OrdersPage() {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const fetchAccounts = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page + 1), page_size: String(pageSize) });
      if (filters.status) params.set('status', filters.status);
      if (filters.accountCode) params.set('account_code', filters.accountCode);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      const response = await apiFetch(`/api/orders?${params.toString()}`, { signal });
      if (!response.ok) throw new Error(`Failed to load trading accounts (${response.status}).`);
      const payload: unknown = await response.json();
      if (!isTradingAccountsResponse(payload)) {
        throw new Error('The trading account service returned an invalid response.');
      }

      setAccounts(payload.data);
      setTotalCount(payload.meta.totalCount);
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load trading accounts.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAccounts(controller.signal);
    return () => controller.abort();
  }, [fetchAccounts]);

  function updateFilters(update: (current: Filters) => Filters) {
    setPage(0);
    setFilters(update);
  }

  if (error) return <ErrorState message={error} onRetry={() => void fetchAccounts()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trading Account Monitoring</h1>
        <p className="text-muted-foreground">Monitor terminal-owned accounts, balances, margin and current status.</p>
      </div>
      <FilterBar onClear={() => updateFilters(() => initialFilters)} hasActiveFilters={Object.values(filters).some(Boolean)}>
        <SelectFilter label="Status" value={filters.status} onChange={(value) => updateFilters(current => ({ ...current, status: value }))} options={[{ label: 'Active', value: 'active' }, { label: 'Expired', value: 'expired' }, { label: 'Locked', value: 'locked' }]} />
        <TextFilter label="Account code" value={filters.accountCode} onChange={(value) => updateFilters(current => ({ ...current, accountCode: value }))} placeholder="Search account code" />
        <DateRangeFilter label="Created" from={filters.dateFrom} to={filters.dateTo} onFromChange={(value) => updateFilters(current => ({ ...current, dateFrom: value }))} onToChange={(value) => updateFilters(current => ({ ...current, dateTo: value }))} />
      </FilterBar>
      {loading ? <LoadingState rows={10} /> : accounts.length === 0 ? <EmptyState message="No trading accounts found for the selected filters." /> : (
        <DataTable
          columns={columns}
          data={accounts}
          tableId="trading-accounts"
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50, 100]}
          totalCount={totalCount}
          serverPagination={{
            pageIndex: page,
            pageSize,
            pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
            onPageIndexChange: setPage,
            onPageSizeChange: (size) => {
              setPage(0);
              setPageSize(size);
            },
          }}
        />
      )}
    </div>
  );
}
