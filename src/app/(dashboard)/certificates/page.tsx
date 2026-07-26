'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/fetch';
import { DataTable } from '@/components/shared/data-table';
import { FilterBar, SelectFilter, TextFilter, DateRangeFilter } from '@/components/shared/filters';
import { ExportButton } from '@/components/shared/export-button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { BatchActionBar } from '@/components/shared/batch-action-bar';
import { CERTIFICATE_BATCH_ACTIONS } from '@/components/shared/batch-action-bar';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CertificatePreviewModal } from '@/components/certificates/certificate-preview-modal';
import type { Certificate, CertificateAnalytics } from '@/types/database';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import {
  Award, RefreshCw, Download, Eye, Send, Trash2,
  ShieldCheck, Clock, CheckCircle2, AlertCircle, FileCheck,
} from 'lucide-react';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  pending:   { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',   Icon: Clock },
  generated: { label: 'Generated', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',           Icon: FileCheck },
  downloaded:{ label: 'Downloaded',cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',   Icon: Download },
  verified:  { label: 'Verified',  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', Icon: CheckCircle2 },
  failed:    { label: 'Failed',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',               Icon: AlertCircle },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', Icon: Award };
  const { label, cls, Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function CertTypeBadge({ type }: { type: string }) {
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border">
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Filters {
  status: string;
  certificate_type: string;
  user_id: string;
  date_from: string;
  date_to: string;
}

const EMPTY_FILTERS: Filters = {
  status: '',
  certificate_type: '',
  user_id: '',
  date_from: '',
  date_to: '',
};

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [analytics, setAnalytics] = useState<CertificateAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);

  // Generate modal state
  const [genModal, setGenModal] = useState(false);
  const [genForm, setGenForm] = useState({
    user_id: '',
    payout_id: '',
    account_id: '',
    certificate_type: 'profit_certificate' as Certificate['certificate_type'],
    amount: '',
  });
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');

  const selectedIds = Object.keys(rowSelection)
    .filter((k) => rowSelection[k])
    .map((idx) => certs[parseInt(idx)]?.id)
    .filter(Boolean);

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.certificate_type) params.set('certificate_type', filters.certificate_type);
      if (filters.user_id) params.set('user_id', filters.user_id);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

      const res = await apiFetch(`/api/certificates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setCerts(json.data || []);
      setTotalCount(json.meta?.totalCount ?? 0);
      setAnalytics(json.analytics || null);
    } catch {
      setError('Failed to load certificates.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);

  // ── Single-row actions ────────────────────────────────────────────────────

  async function callAction(id: string, action: string) {
    await apiFetch(`/api/certificates/${id}/${action}`, { method: 'POST' });
    fetchCerts();
  }

  async function handleDownload(cert: Certificate) {
    // Record download event then open URL
    await apiFetch(`/api/certificates/${cert.id}/download`, { method: 'POST' });
    if (cert.download_url) {
      window.open(cert.download_url, '_blank', 'noopener,noreferrer');
    }
    fetchCerts();
  }

  function getRowActions(row: Certificate): RowAction[] {
    const actions: RowAction[] = [
      {
        id: 'view',
        label: 'View Details',
        icon: <Eye className="h-3.5 w-3.5" />,
        onClick: () => setPreviewCert(row),
      },
    ];

    if (row.download_url) {
      actions.push({
        id: 'download',
        label: 'Download',
        icon: <Download className="h-3.5 w-3.5" />,
        onClick: () => handleDownload(row),
      });
    }

    if (['failed', 'generated', 'downloaded'].includes(row.status)) {
      actions.push({
        id: 'regenerate',
        label: 'Regenerate',
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        onClick: () => callAction(row.id, 'regenerate'),
      });
    }

    actions.push({
      id: 'resend',
      label: 'Resend Email',
      icon: <Send className="h-3.5 w-3.5" />,
      onClick: () => callAction(row.id, 'resend'),
    });

    if (row.status !== 'verified') {
      actions.push({
        id: 'verify',
        label: 'Verify',
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
        onClick: () => callAction(row.id, 'verify'),
      });
    }

    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      variant: 'destructive',
      onClick: () => callAction(row.id, 'delete'),
    });

    return actions;
  }

  // ── Batch actions ─────────────────────────────────────────────────────────

  async function handleBatchAction(actionId: string) {
    for (const id of selectedIds) {
      await apiFetch(`/api/certificates/${id}/${actionId}`, { method: 'POST' });
    }
    setRowSelection({});
    fetchCerts();
  }

  // ── Generate certificate ──────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!genForm.user_id.trim()) { setGenError('User ID is required.'); return; }
    setGenLoading(true);
    setGenError('');
    try {
      const res = await apiFetch('/api/certificates', {
        method: 'POST',
        body: JSON.stringify({
          user_id: genForm.user_id.trim(),
          ...(genForm.payout_id ? { payout_id: genForm.payout_id.trim() } : {}),
          ...(genForm.account_id ? { account_id: genForm.account_id.trim() } : {}),
          certificate_type: genForm.certificate_type,
          ...(genForm.amount ? { amount: parseFloat(genForm.amount) } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setGenError(data.error?.message || 'Generation failed.');
        return;
      }
      setGenModal(false);
      setGenForm({ user_id: '', payout_id: '', account_id: '', certificate_type: 'profit_certificate', amount: '' });
      fetchCerts();
    } catch {
      setGenError('Generation failed. Please try again.');
    } finally {
      setGenLoading(false);
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: ColumnDef<Certificate, any>[] = [
    {
      accessorKey: 'certificate_number',
      header: 'Certificate #',
      cell: ({ getValue, row }) => (
        <Link
          href={`/certificates/${row.original.id}`}
          className="font-mono text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {(getValue() as string) || row.original.id.slice(0, 8) + '…'}
        </Link>
      ),
    },
    {
      accessorKey: 'certificate_type',
      header: 'Type',
      cell: ({ getValue }) => <CertTypeBadge type={getValue() as string} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    },
    {
      accessorKey: 'user_id',
      header: 'Trader',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {(getValue() as string)?.slice(0, 12)}…
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v != null
          ? <span className="font-medium">₹{v.toLocaleString('en-IN')}</span>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: 'generated_at',
      header: 'Generated',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v
          ? <span className="text-xs">{new Date(v).toLocaleDateString()}</span>
          : <span className="text-muted-foreground text-xs">—</span>;
      },
    },
    {
      accessorKey: 'email_sent_at',
      header: 'Email Sent',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v
          ? <span className="text-xs text-green-600">✓ {new Date(v).toLocaleDateString()}</span>
          : <span className="text-muted-foreground text-xs">Not sent</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="group">
          <RowActions actions={getRowActions(row.original)} />
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (error) return <ErrorState message={error} onRetry={fetchCerts} />;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Certificate Center</h1>
          <p className="text-muted-foreground">
            Manage trader certificates — all generation handled by the backend engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton sourceCenter="certificates" filters={filters} totalCount={totalCount} />
          <Button onClick={() => setGenModal(true)} className="gap-2">
            <Award className="h-4 w-4" />
            Generate Certificate
          </Button>
        </div>
      </div>

      {/* Analytics cards */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              { key: 'total',      label: 'Total',      val: analytics.total,      cls: '' },
              { key: 'pending',    label: 'Pending',    val: analytics.pending,    cls: 'text-yellow-600' },
              { key: 'generated',  label: 'Generated',  val: analytics.generated,  cls: 'text-blue-600' },
              { key: 'downloaded', label: 'Downloaded', val: analytics.downloaded, cls: 'text-purple-600' },
              { key: 'verified',   label: 'Verified',   val: analytics.verified,   cls: 'text-emerald-600' },
            ] as const
          ).map(({ key, label, val, cls }) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${cls}`}>{val}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <FilterBar
        onClear={() => setFilters(EMPTY_FILTERS)}
        hasActiveFilters={hasActiveFilters}
      >
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { label: 'Pending',    value: 'pending' },
            { label: 'Generated',  value: 'generated' },
            { label: 'Downloaded', value: 'downloaded' },
            { label: 'Verified',   value: 'verified' },
            { label: 'Failed',     value: 'failed' },
          ]}
        />
        <SelectFilter
          label="Type"
          value={filters.certificate_type}
          onChange={(v) => setFilters((f) => ({ ...f, certificate_type: v }))}
          options={[
            { label: 'Profit Certificate',  value: 'profit_certificate' },
            { label: 'Funded Trader',        value: 'funded_trader' },
            { label: 'Phase Completion',     value: 'phase_completion' },
          ]}
        />
        <TextFilter
          label="Trader User ID"
          value={filters.user_id}
          onChange={(v) => setFilters((f) => ({ ...f, user_id: v }))}
          placeholder="UUID…"
        />
        <DateRangeFilter
          label="Created Date"
          from={filters.date_from}
          to={filters.date_to}
          onFromChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
        />
      </FilterBar>

      {/* Table */}
      {loading ? (
        <LoadingState rows={8} />
      ) : certs.length === 0 ? (
        <EmptyState
          icon={<Award className="h-6 w-6 text-muted-foreground" />}
          message="No certificates match the current filters."
          action={
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={certs}
          pageSize={20}
          totalCount={totalCount}
          enableRowSelection
          onRowSelectionChange={setRowSelection}
        />
      )}

      {/* Batch action bar */}
      <BatchActionBar
        selectedCount={selectedIds.length}
        actions={CERTIFICATE_BATCH_ACTIONS}
        onAction={handleBatchAction}
        onClear={() => setRowSelection({})}
      />

      {/* Certificate preview modal */}
      {previewCert && (
        <CertificatePreviewModal
          cert={previewCert}
          onClose={() => setPreviewCert(null)}
          onAction={async (action) => {
            if (action === 'download') {
              await handleDownload(previewCert);
            } else {
              await callAction(previewCert.id, action);
            }
            setPreviewCert(null);
          }}
        />
      )}

      {/* Generate Certificate modal */}
      {genModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setGenModal(false); setGenError(''); }}
          />
          <div className="relative bg-background p-6 rounded-xl shadow-2xl border w-full max-w-md space-y-4 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold">Generate Certificate</h3>
                <p className="text-xs text-muted-foreground">
                  Request is forwarded to the backend Certificate Engine
                </p>
              </div>
            </div>

            <form onSubmit={handleGenerate} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Trader User ID <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={genForm.user_id}
                  onChange={(e) => setGenForm((f) => ({ ...f, user_id: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Certificate Type <span className="text-destructive">*</span></label>
                <select
                  value={genForm.certificate_type}
                  onChange={(e) =>
                    setGenForm((f) => ({
                      ...f,
                      certificate_type: e.target.value as Certificate['certificate_type'],
                    }))
                  }
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="profit_certificate">Profit Certificate</option>
                  <option value="funded_trader">Funded Trader</option>
                  <option value="phase_completion">Phase Completion</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Payout ID</label>
                  <input
                    type="text"
                    value={genForm.payout_id}
                    onChange={(e) => setGenForm((f) => ({ ...f, payout_id: e.target.value }))}
                    placeholder="Optional UUID"
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Account ID</label>
                  <input
                    type="text"
                    value={genForm.account_id}
                    onChange={(e) => setGenForm((f) => ({ ...f, account_id: e.target.value }))}
                    placeholder="Optional UUID"
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={genForm.amount}
                  onChange={(e) => setGenForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="Optional — shown on certificate"
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {genError && (
                <p className="text-sm text-destructive">{genError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setGenModal(false); setGenError(''); }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={genLoading} className="gap-2">
                  {genLoading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Award className="h-3.5 w-3.5" />
                  )}
                  {genLoading ? 'Generating…' : 'Generate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
