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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  kyc_status: string;
  account_status: string;
  created_at: string;
}

const columns: ColumnDef<UserRow, any>[] = [
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      const first = row.original.first_name || '';
      const last = row.original.last_name || '';
      return `${first} ${last}`.trim() || '—';
    },
  },
  { accessorKey: 'username', header: 'Username', cell: ({ getValue }) => getValue() || '—' },
  { accessorKey: 'country', header: 'Country', cell: ({ getValue }) => getValue() || '—' },
  {
    accessorKey: 'kyc_status',
    header: 'KYC',
    cell: ({ getValue }) => {
      const status = getValue() as string;
      const colors: Record<string, string> = {
        verified: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      };
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] || ''}`}>{status}</span>;
    },
  },
  {
    accessorKey: 'account_status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue() as string;
      const colors: Record<string, string> = {
        active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        banned: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        deactivated: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      };
      return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] || ''}`}>{status}</span>;
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Registered',
    cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
  },
];

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    kycStatus: '',
    accountStatus: '',
    dateFrom: '',
    dateTo: '',
    country: '',
  });

  useEffect(() => {
    fetchUsers();
  }, [filters]);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filters.kycStatus) params.set('kyc_status', filters.kycStatus);
      if (filters.accountStatus) params.set('account_status', filters.accountStatus);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.country) params.set('country', filters.country);

      const res = await apiFetch(`/api/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch users');

      const json = await res.json();
      setUsers(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
    } catch {
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchUsers();
  }

  function clearFilters() {
    setFilters({ kycStatus: '', accountStatus: '', dateFrom: '', dateTo: '', country: '' });
    setSearchQuery('');
  }

  const hasActiveFilters = Object.values(filters).some(Boolean) || !!searchQuery;

  if (error) {
    return <ErrorState message={error} onRetry={fetchUsers} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Intelligence Center</h1>
          <p className="text-muted-foreground">Single source of truth for every platform user</p>
        </div>
        <ExportButton sourceCenter="users" filters={filters} totalCount={totalCount} />
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, username, ID, phone, or account number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Filters */}
      <FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
        <SelectFilter
          label="KYC Status"
          value={filters.kycStatus}
          onChange={(v) => setFilters((f) => ({ ...f, kycStatus: v }))}
          options={[
            { label: 'Pending', value: 'pending' },
            { label: 'Submitted', value: 'submitted' },
            { label: 'Verified', value: 'verified' },
            { label: 'Rejected', value: 'rejected' },
          ]}
        />
        <SelectFilter
          label="Account Status"
          value={filters.accountStatus}
          onChange={(v) => setFilters((f) => ({ ...f, accountStatus: v }))}
          options={[
            { label: 'Active', value: 'active' },
            { label: 'Suspended', value: 'suspended' },
            { label: 'Banned', value: 'banned' },
            { label: 'Deactivated', value: 'deactivated' },
          ]}
        />
        <DateRangeFilter
          label="Registration Date"
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
        />
        <TextFilter
          label="Country"
          value={filters.country}
          onChange={(v) => setFilters((f) => ({ ...f, country: v }))}
          placeholder="e.g. United States"
        />
      </FilterBar>

      {/* Data Table */}
      {loading ? (
        <LoadingState rows={8} />
      ) : users.length === 0 ? (
        <EmptyState message="No users match the current filters. Try adjusting your search criteria." />
      ) : (
        <DataTable
          columns={columns}
          data={users}
          totalCount={totalCount}
          enableRowSelection
        />
      )}
    </div>
  );
}
