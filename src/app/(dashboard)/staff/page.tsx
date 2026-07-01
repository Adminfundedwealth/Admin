'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { SlidePanel } from '@/components/shared/slide-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, Shield, Ban, RotateCcw, Key, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

/**
 * Staff Management Center — full CRUD with role assignment.
 * Reads: staff_members, staff_role_assignments, roles
 * Writes: staff_members, staff_role_assignments, audit_records
 */

interface StaffRow {
  id: string;
  name: string;
  email: string;
  status: string;
  totp_enabled: boolean;
  created_at: string;
  roles: { id: string; name: string }[];
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffRow | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', roleIds: [] as string[] });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ tempPassword: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchStaff();
    fetchRoles();
  }, []);

  async function fetchStaff() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/staff');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setStaff(json.data || []);
    } catch {
      setError('Failed to load staff.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoles() {
    try {
      const res = await apiFetch('/api/roles');
      if (res.ok) {
        const json = await res.json();
        setRoles(json.data || []);
      }
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name || !createForm.email || createForm.roleIds.length === 0) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (res.ok) {
        setCreateResult({ tempPassword: json.tempPassword });
        fetchStaff();
      } else {
        alert(json.error?.message || 'Failed to create staff member');
      }
    } catch {
      alert('An error occurred');
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(staffId: string, newStatus: string) {
    setActionLoading(staffId);
    try {
      const res = await apiFetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchStaff();
    } catch {}
    finally { setActionLoading(null); }
  }

  async function handleResetPassword(staffId: string) {
    setActionLoading(staffId);
    try {
      const res = await apiFetch(`/api/staff/${staffId}/reset-password`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        alert(`Temporary password: ${json.tempPassword}\nExpires in ${json.expiresIn}`);
      } else {
        alert(json.error?.message || 'Failed');
      }
    } catch {}
    finally { setActionLoading(null); }
  }

  async function handleAssignRole(staffId: string, roleId: string) {
    try {
      const res = await apiFetch(`/api/staff/${staffId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });
      if (res.ok) fetchStaff();
    } catch {}
  }

  async function handleRemoveRole(staffId: string, roleId: string) {
    try {
      const res = await apiFetch(`/api/staff/${staffId}/roles`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });
      if (res.ok) fetchStaff();
    } catch {}
  }

  const columns: ColumnDef<StaffRow, any>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'roles',
      header: 'Roles',
      cell: ({ getValue }) => {
        const r = getValue() as { id: string; name: string }[];
        return (
          <div className="flex flex-wrap gap-1">
            {r.map(role => (
              <span key={role.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {role.name}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string;
        const color = s === 'active' ? 'bg-green-100 text-green-800' : s === 'disabled' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
        return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${color}`}>{s}</span>;
      },
    },
    {
      accessorKey: 'totp_enabled',
      header: '2FA',
      cell: ({ getValue }) => getValue() ? <span className="text-green-600 text-xs">Enabled</span> : <span className="text-muted-foreground text-xs">Not Set</span>,
    },
    { accessorKey: 'created_at', header: 'Created', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
  ];

  if (error) return <ErrorState message={error} onRetry={fetchStaff} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Management Center</h1>
          <p className="text-muted-foreground">Manage staff accounts, roles, and security controls</p>
        </div>
        <Button className="gap-2" onClick={() => { setShowCreateForm(true); setCreateResult(null); }}>
          <UserPlus className="h-4 w-4" /> Create Staff Member
        </Button>
      </div>

      {loading ? (
        <LoadingState rows={6} />
      ) : staff.length === 0 ? (
        <EmptyState message="No staff members found." />
      ) : (
        <DataTable
          columns={columns}
          data={staff}
          pageSize={20}
          onRowClick={(row) => { setSelectedStaff(row); setPanelOpen(true); }}
        />
      )}

      {/* Create Staff Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateForm(false)} />
          <div className="relative bg-background p-6 rounded-xl shadow-2xl w-full max-w-md space-y-4 border">
            {createResult ? (
              <>
                <h3 className="text-lg font-bold text-green-600">Staff Member Created</h3>
                <div className="p-4 rounded-lg bg-muted space-y-2">
                  <p className="text-sm"><strong>Temporary Password:</strong></p>
                  <code className="block w-full p-2 bg-background rounded border text-sm font-mono select-all">{createResult.tempPassword}</code>
                  <p className="text-xs text-muted-foreground">Share this securely. Expires in 72 hours. They must set up 2FA on first login.</p>
                </div>
                <Button onClick={() => { setShowCreateForm(false); setCreateResult(null); setCreateForm({ name: '', email: '', roleIds: [] }); }}>Done</Button>
              </>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <h3 className="text-lg font-bold">Create Staff Member</h3>
                <Input placeholder="Full Name" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} required />
                <Input placeholder="Email" type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} required />
                <div>
                  <label className="text-sm font-medium">Assign Roles</label>
                  <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                    {roles.map(role => (
                      <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createForm.roleIds.includes(role.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setCreateForm(f => ({ ...f, roleIds: [...f.roleIds, role.id] }));
                            } else {
                              setCreateForm(f => ({ ...f, roleIds: f.roleIds.filter(id => id !== role.id) }));
                            }
                          }}
                          className="rounded"
                        />
                        <span>{role.name}</span>
                        {role.description && <span className="text-xs text-muted-foreground">— {role.description}</span>}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" type="button" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={creating || !createForm.name || !createForm.email || createForm.roleIds.length === 0}>
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Staff Detail Panel */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={selectedStaff?.name || ''} subtitle={selectedStaff?.email}>
        {selectedStaff && (
          <div className="space-y-6">
            {/* Status */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
              <p className="text-sm capitalize font-medium">{selectedStaff.status}</p>
              <div className="flex gap-2">
                {selectedStaff.status === 'active' && (
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={actionLoading === selectedStaff.id} onClick={() => handleStatusChange(selectedStaff.id, 'disabled')}>
                    <Ban className="h-3.5 w-3.5" /> Disable
                  </Button>
                )}
                {selectedStaff.status === 'disabled' && (
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={actionLoading === selectedStaff.id} onClick={() => handleStatusChange(selectedStaff.id, 'active')}>
                    <RotateCcw className="h-3.5 w-3.5" /> Enable
                  </Button>
                )}
                {selectedStaff.status === 'locked' && (
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={actionLoading === selectedStaff.id} onClick={() => handleStatusChange(selectedStaff.id, 'active')}>
                    <RotateCcw className="h-3.5 w-3.5" /> Unlock
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" disabled={actionLoading === selectedStaff.id} onClick={() => handleResetPassword(selectedStaff.id)}>
                  <Key className="h-3.5 w-3.5" /> Reset Password
                </Button>
              </div>
            </div>

            {/* Roles */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned Roles</h4>
              <div className="space-y-1">
                {selectedStaff.roles.map(role => (
                  <div key={role.id} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm font-medium">{role.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleRemoveRole(selectedStaff.id, role.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              {/* Add role */}
              <select
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                value=""
                onChange={e => {
                  if (e.target.value) {
                    handleAssignRole(selectedStaff.id, e.target.value);
                  }
                }}
              >
                <option value="">+ Assign role...</option>
                {roles
                  .filter(r => !selectedStaff.roles.some(sr => sr.id === r.id))
                  .map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                }
              </select>
            </div>

            {/* Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">2FA</span><span>{selectedStaff.totp_enabled ? 'Enabled' : 'Not Set'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(selectedStaff.created_at).toLocaleDateString()}</span></div>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
