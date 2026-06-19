'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface StaffRow { id: string; name: string; email: string; status: string; totp_enabled: boolean; created_at: string; }

const columns: ColumnDef<StaffRow, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getValue() === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{getValue() as string}</span> },
  { accessorKey: 'totp_enabled', header: '2FA', cell: ({ getValue }) => getValue() ? <span className="text-green-600">Enabled</span> : <span className="text-muted-foreground">Not Set</span> },
  { accessorKey: 'created_at', header: 'Created', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
];

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchStaff(); }, []);
  async function fetchStaff() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/staff');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setStaff(json.data || []);
    } catch { setError('Failed to load staff.'); }
    finally { setLoading(false); }
  }

  if (error) return <ErrorState message={error} onRetry={fetchStaff} />;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Staff Management Center</h1><p className="text-muted-foreground">Manage staff accounts and security controls</p></div>
        <Button className="gap-2"><UserPlus className="h-4 w-4" /> Create Staff Member</Button>
      </div>
      {loading ? <LoadingState rows={6} /> : staff.length === 0 ? <EmptyState message="No staff members found." /> : <DataTable columns={columns} data={staff} pageSize={20} />}
    </div>
  );
}
