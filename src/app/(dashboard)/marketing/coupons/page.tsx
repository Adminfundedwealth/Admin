'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

/**
 * Coupon Management — full CRUD.
 * Reads: coupons (via /api/coupons)
 * Writes: coupons, audit_records (via /api/coupons POST/PATCH)
 */

interface CouponRow {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  active: boolean;
  expires_at: string | null;
  applicable_plans: string[] | null;
  min_order_amount: number | null;
  description: string | null;
  created_at: string;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    max_uses: '',
    expires_at: '',
    description: '',
  });

  useEffect(() => { fetchCoupons(); }, []);

  async function fetchCoupons() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/coupons');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setCoupons(json.data || []);
    } catch {
      setError('Failed to load coupons.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.toUpperCase(),
          discount_type: form.discount_type,
          discount_value: form.discount_value,
          max_uses: form.max_uses ? parseInt(form.max_uses) : undefined,
          expires_at: form.expires_at || undefined,
          description: form.description || undefined,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ code: '', discount_type: 'percentage', discount_value: 10, max_uses: '', expires_at: '', description: '' });
        fetchCoupons();
      } else {
        const json = await res.json();
        alert(json.error?.message || 'Failed to create coupon');
      }
    } catch {} finally { setCreating(false); }
  }

  async function toggleCoupon(id: string, currentActive: boolean) {
    await apiFetch('/api/coupons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !currentActive }),
    });
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, active: !currentActive } : c));
  }

  const columns: ColumnDef<CouponRow, any>[] = [
    { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span className="font-mono font-bold">{getValue() as string}</span> },
    {
      accessorKey: 'discount_value',
      header: 'Discount',
      cell: ({ row }) => row.original.discount_type === 'percentage' ? `${row.original.discount_value}%` : `₹${row.original.discount_value}`,
    },
    {
      accessorKey: 'uses_count',
      header: 'Uses',
      cell: ({ row }) => `${row.original.uses_count}${row.original.max_uses ? ` / ${row.original.max_uses}` : ''}`,
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => (
        <button onClick={() => toggleCoupon(row.original.id, row.original.active)}>
          {row.original.active
            ? <ToggleRight className="h-5 w-5 text-green-600" />
            : <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          }
        </button>
      ),
    },
    {
      accessorKey: 'expires_at',
      header: 'Expires',
      cell: ({ getValue }) => getValue() ? new Date(getValue() as string).toLocaleDateString() : 'Never',
    },
    { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => getValue() || '—' },
    { accessorKey: 'created_at', header: 'Created', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchCoupons} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coupon Management</h1>
          <p className="text-muted-foreground">Create and manage discount codes</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" /> Create Coupon
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Input placeholder="CODE" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required className="font-mono" />
              <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as any }))} className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
              <Input type="number" placeholder="Value" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} required min={1} />
              <Input type="number" placeholder="Max uses (optional)" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} />
              <Input type="date" placeholder="Expires (optional)" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
              <Input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={creating || !form.code}>{creating ? 'Creating...' : 'Create'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? <LoadingState rows={6} /> : coupons.length === 0 ? (
        <EmptyState message="No coupons created yet." />
      ) : (
        <DataTable columns={columns} data={coupons} pageSize={20} />
      )}
    </div>
  );
}
