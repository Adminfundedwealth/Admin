'use client';

import { apiFetch } from '@/lib/api/fetch';
import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { LoadingState } from '@/components/shared/loading-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SlidersHorizontal, Lock, Unlock, X, AlertTriangle,
  ChevronDown, ChevronRight, RefreshCw, Search,
  ShieldAlert, Activity, TrendingDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trader {
  email: string;
  display_name: string;
}

interface AccountRow {
  id: string;
  account_code: string;
  balance: number;
  status: string;
  locked_reason: string | null;
  locked_at: string | null;
  terminal_traders: Trader | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface Position {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  product_type: string;
  avg_price: number;
  is_open: boolean;
  opened_at: string;
}

interface Challenge {
  plan?: string;
  phase?: string;
  daily_loss_limit_pct?: number;
  max_drawdown_pct?: number;
  profit_target_pct?: number;
  status?: string;
}

interface RiskEvent {
  event_type: string;
  severity: string;
  rule_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface AccountDetail {
  account: AccountRow;
  trader: Trader | null;
  positions: Position[];
  challenge: Challenge | null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return { toasts, push };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium border max-w-sm
            ${t.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700/50 text-emerald-200'
              : 'bg-red-950/90 border-red-700/50 text-red-200'
            }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'destructive' | 'default';
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open, title, description, confirmLabel, confirmVariant = 'destructive',
  requireReason, reasonLabel, loading, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  if (!open) return null;

  const canConfirm = !requireReason || reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-background p-6 rounded-xl shadow-2xl w-full max-w-md space-y-4 border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="text-base font-bold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {requireReason && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{reasonLabel ?? 'Reason'} <span className="text-destructive">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason…"
              className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            variant={confirmVariant}
            size="sm"
            disabled={loading || !canConfirm}
            onClick={() => onConfirm(requireReason ? reason : undefined)}
          >
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Expanded Row Detail ──────────────────────────────────────────────────────

function ExpandedDetail({ accountId }: { accountId: string }) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [detailRes, eventsRes] = await Promise.all([
          apiFetch(`/api/founder/terminal-accounts/${accountId}/detail`),
          apiFetch(`/api/founder/terminal-accounts/${accountId}/risk-events`),
        ]);
        if (cancelled) return;
        if (!detailRes.ok) throw new Error('Failed to load account detail');
        const detailJson = await detailRes.json();
        setDetail(detailJson);
        if (eventsRes.ok) {
          const eventsJson = await eventsRes.json();
          setRiskEvents((eventsJson.events ?? []).slice(0, 5));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load detail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [accountId]);

  if (loading) return (
    <div className="px-4 py-3">
      <div className="h-3 w-1/3 rounded bg-muted animate-pulse mb-2" />
      <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
    </div>
  );
  if (error) return <p className="px-4 py-3 text-xs text-destructive">{error}</p>;
  if (!detail) return null;

  const { positions, challenge } = detail;

  return (
    <div className="px-4 py-4 border-t bg-muted/20 grid grid-cols-1 md:grid-cols-3 gap-6 text-[12px]">
      {/* Positions */}
      <div className="space-y-2">
        <p className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Activity className="h-3 w-3" /> Open Positions ({positions.length})
        </p>
        {positions.length === 0 ? (
          <p className="text-muted-foreground">No open positions</p>
        ) : (
          <div className="space-y-1.5">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded border px-2 py-1.5 bg-background">
                <div>
                  <span className="font-medium">{p.symbol}</span>
                  <span className={`ml-1.5 text-[10px] font-semibold ${p.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {p.side}
                  </span>
                </div>
                <div className="text-right text-muted-foreground">
                  <p>{p.qty} × ₹{p.avg_price?.toLocaleString()}</p>
                  <p className="text-[10px]">{p.product_type}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Challenge */}
      <div className="space-y-2">
        <p className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <TrendingDown className="h-3 w-3" /> Challenge Info
        </p>
        {!challenge ? (
          <p className="text-muted-foreground">No challenge data</p>
        ) : (
          <div className="space-y-1">
            {challenge.plan && <InfoLine label="Plan" value={challenge.plan} />}
            {challenge.phase && <InfoLine label="Phase" value={challenge.phase} />}
            {challenge.status && <InfoLine label="Status" value={challenge.status} />}
            {challenge.profit_target_pct != null && (
              <InfoLine label="Profit Target" value={`${challenge.profit_target_pct}%`} />
            )}
            {challenge.daily_loss_limit_pct != null && (
              <InfoLine label="Daily Loss Limit" value={`${challenge.daily_loss_limit_pct}%`} />
            )}
            {challenge.max_drawdown_pct != null && (
              <InfoLine label="Max Drawdown" value={`${challenge.max_drawdown_pct}%`} />
            )}
          </div>
        )}
      </div>

      {/* Risk Events */}
      <div className="space-y-2">
        <p className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" /> Recent Risk Events
        </p>
        {riskEvents.length === 0 ? (
          <p className="text-muted-foreground">No recent risk events</p>
        ) : (
          <div className="space-y-1.5">
            {riskEvents.map((e, i) => (
              <div key={i} className="rounded border px-2 py-1.5 bg-background space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{e.event_type?.replace(/_/g, ' ')}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                    ${e.severity === 'critical' ? 'bg-red-500/10 text-red-500'
                      : e.severity === 'warning' ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-muted text-muted-foreground'}`}>
                    {e.severity}
                  </span>
                </div>
                <p className="text-muted-foreground text-[10px]">
                  {e.rule_type} · {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DialogType = 'freeze' | 'unfreeze' | 'close-positions' | null;

interface DialogState {
  type: DialogType;
  accountId: string;
  accountCode: string;
}

const STATUS_FILTERS = ['', 'active', 'locked', 'breached', 'completed'] as const;
const STATUS_LABELS: Record<string, string> = {
  '': 'All', active: 'Active', locked: 'Locked', breached: 'Breached', completed: 'Completed',
};

export default function AccountControlPage() {
  const { toasts, push: pushToast } = useToast();

  // List state
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action dialog
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Debounce ref
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch accounts ──────────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async (q: string, status: string, pg: number) => {
    setLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('search', q.trim());
      if (status) params.set('status', status);
      params.set('page', String(pg));
      params.set('limit', '20');

      const res = await apiFetch(`/api/founder/terminal-accounts?${params}`);
      if (res.status === 403) {
        setListError('Admin access required. Make sure your user ID is in FOUNDER_USER_IDS on the terminal server.');
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setListError(json?.error?.message || json?.message || 'Failed to load accounts');
        return;
      }
      const json = await res.json();
      setAccounts(json.accounts ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      setListError('Network error — could not reach terminal backend');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAccounts(search, statusFilter, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      fetchAccounts(value, statusFilter, 1);
    }, 400);
  }

  function handleStatusFilter(status: string) {
    setStatusFilter(status);
    setPage(1);
    fetchAccounts(search, status, 1);
  }

  function handlePage(newPage: number) {
    setPage(newPage);
    fetchAccounts(search, statusFilter, newPage);
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleAction(reason?: string) {
    if (!dialog) return;
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = {};
      if (dialog.type === 'freeze' && reason) body.reason = reason;

      const res = await apiFetch(
        `/api/founder/terminal-accounts/${dialog.accountId}/${dialog.type}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      const json = await res.json();

      if (res.status === 409) {
        pushToast(
          dialog.type === 'freeze'
            ? 'Account is already frozen'
            : 'Account is already active',
          'error',
        );
        setDialog(null);
        return;
      }
      if (!res.ok) {
        pushToast(json?.error?.message || json?.message || `Action failed (${res.status})`, 'error');
        setDialog(null);
        return;
      }

      const successMessages: Record<string, string> = {
        freeze: `Account ${dialog.accountCode} frozen`,
        unfreeze: `Account ${dialog.accountCode} unfrozen — trading restored`,
        'close-positions': `Positions closed for ${dialog.accountCode}${json.closed != null ? ` (${json.closed} closed)` : ''}`,
      };
      pushToast(json.message || successMessages[dialog.type!] || 'Done', 'success');
      setDialog(null);
      // Refresh list
      await fetchAccounts(search, statusFilter, page);
    } catch {
      pushToast('Network error — action may not have completed', 'error');
      setDialog(null);
    } finally {
      setActionLoading(false);
    }
  }

  function openDialog(type: DialogType, account: AccountRow) {
    setDialog({ type, accountId: account.id, accountCode: account.account_code });
  }

  // ── Dialog config ────────────────────────────────────────────────────────────
  function dialogProps() {
    if (!dialog) return null;
    const code = dialog.accountCode;
    switch (dialog.type) {
      case 'freeze': return {
        title: `Freeze Account ${code}`,
        description: 'This will block all trading on this account immediately. A reason is required.',
        confirmLabel: '🔒 Freeze Account',
        requireReason: true,
        reasonLabel: 'Freeze reason',
      };
      case 'unfreeze': return {
        title: `Unfreeze Account ${code}`,
        description: 'This will restore trading access. Confirm to proceed.',
        confirmLabel: '🔓 Unfreeze Account',
        confirmVariant: 'default' as const,
        requireReason: false,
      };
      case 'close-positions': return {
        title: `Close All Positions — ${code}`,
        description: '⚠️ This bypasses the risk engine and force-closes all open positions. Use only when the trader cannot close positions themselves.',
        confirmLabel: '✕ Close All Positions',
        requireReason: false,
      };
      default: return null;
    }
  }

  const dProps = dialogProps();

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-6xl">
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SlidersHorizontal className="h-7 w-7 text-destructive" /> Account Control
        </h1>
        <p className="text-muted-foreground mt-1">
          Founder-only. Freeze, unfreeze, and force-close positions on any trading account.
        </p>
      </div>

      {/* Search + Status Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by email, name, or account code…"
            className="pl-9 h-9"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                ${statusFilter === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          <button
            onClick={() => { fetchAccounts(search, statusFilter, page); }}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground border hover:border-foreground/30 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {listError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Error loading accounts</p>
            <p className="text-destructive/80 mt-0.5">{listError}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!listError && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="h-9 w-6 px-3 border-b" />
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground border-b whitespace-nowrap">Account Code</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground border-b whitespace-nowrap">Trader</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground border-b whitespace-nowrap">Balance</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground border-b whitespace-nowrap">Status</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground border-b whitespace-nowrap">Locked Reason</th>
                    <th className="h-9 px-3 text-right font-medium text-muted-foreground border-b whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="h-11 px-3">
                            <div className="h-3 rounded bg-muted animate-pulse" style={{ width: `${60 + j * 8}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="h-24 text-center text-muted-foreground text-sm">
                        No accounts found.
                      </td>
                    </tr>
                  ) : (
                    accounts.map((acct) => (
                      <AccountTableRow
                        key={acct.id}
                        account={acct}
                        expanded={expandedId === acct.id}
                        onToggleExpand={() => setExpandedId(expandedId === acct.id ? null : acct.id)}
                        onFreeze={() => openDialog('freeze', acct)}
                        onUnfreeze={() => openDialog('unfreeze', acct)}
                        onClosePositions={() => openDialog('close-positions', acct)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-[12px] text-muted-foreground">
                <span>
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline" size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page <= 1}
                    onClick={() => handlePage(page - 1)}
                  >
                    ← Prev
                  </Button>
                  <span className="flex items-center px-2">
                    {page} / {pagination.pages}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page >= pagination.pages}
                    onClick={() => handlePage(page + 1)}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      {dProps && (
        <ConfirmDialog
          open={!!dialog}
          title={dProps.title}
          description={dProps.description}
          confirmLabel={dProps.confirmLabel}
          confirmVariant={dProps.confirmVariant ?? 'destructive'}
          requireReason={dProps.requireReason}
          reasonLabel={dProps.reasonLabel}
          loading={actionLoading}
          onConfirm={handleAction}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ─── Account Table Row ────────────────────────────────────────────────────────

interface AccountTableRowProps {
  account: AccountRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onFreeze: () => void;
  onUnfreeze: () => void;
  onClosePositions: () => void;
}

function AccountTableRow({
  account, expanded, onToggleExpand, onFreeze, onUnfreeze, onClosePositions,
}: AccountTableRowProps) {
  const isActive = account.status === 'active';
  const isLocked = account.status === 'locked' || account.status === 'breached';

  return (
    <>
      <tr
        className="border-t hover:bg-muted/40 transition-colors cursor-pointer group"
        onClick={onToggleExpand}
      >
        {/* Expand toggle */}
        <td className="px-3 h-11 align-middle w-6">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </td>

        {/* Account code */}
        <td className="px-3 h-11 align-middle">
          <span className="font-mono font-medium text-xs">{account.account_code}</span>
        </td>

        {/* Trader */}
        <td className="px-3 h-11 align-middle">
          <div>
            <p className="font-medium">{account.terminal_traders?.display_name ?? '—'}</p>
            <p className="text-[11px] text-muted-foreground">{account.terminal_traders?.email ?? ''}</p>
          </div>
        </td>

        {/* Balance */}
        <td className="px-3 h-11 align-middle whitespace-nowrap">
          ₹{(account.balance ?? 0).toLocaleString()}
        </td>

        {/* Status */}
        <td className="px-3 h-11 align-middle">
          <StatusBadge status={account.status as any} />
        </td>

        {/* Locked reason */}
        <td className="px-3 h-11 align-middle max-w-[180px]">
          {account.locked_reason ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 truncate block" title={account.locked_reason}>
              {account.locked_reason}
            </span>
          ) : (
            <span className="text-muted-foreground text-[11px]">—</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-3 h-11 align-middle" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            {isActive && (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2 text-xs gap-1 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:border-amber-500"
                onClick={onFreeze}
                title="Freeze — blocks all trading"
              >
                <Lock className="h-3 w-3" /> Freeze
              </Button>
            )}
            {isLocked && (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2 text-xs gap-1 border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500"
                onClick={onUnfreeze}
                title="Unfreeze — restores trading"
              >
                <Unlock className="h-3 w-3" /> Unfreeze
              </Button>
            )}
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive"
              onClick={onClosePositions}
              title="Force-close all open positions (bypasses risk engine)"
            >
              <X className="h-3 w-3" /> Close Positions
            </Button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <ExpandedDetail accountId={account.id} />
          </td>
        </tr>
      )}
    </>
  );
}
