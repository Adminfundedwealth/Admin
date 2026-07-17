'use client';

/**
 * /founder/delete-accounts
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder-only. Search and manage trading accounts for deletion/archiving.
 *
 * Search supports:
 *  • Account code  e.g. FW-MI41I7D0E1
 *  • Email address e.g. trader@example.com
 *  • Trader ID fragment e.g. aa094c86
 *  • Challenge UUID fragment
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { EmptyState } from '@/components/shared/empty-state';
import { DeleteArchiveModal } from '@/components/shared/delete-archive-modal';
import { formatCurrency } from '@/lib/utils';
import {
  ShieldAlert, Trash2, Archive, RefreshCw,
  AlertTriangle, CheckCircle, Search, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AccountRow {
  id: string;
  type: string | null;
  plan: string | null;
  status: string | null;
  initial_balance: number | null;
  current_balance: number | null;
  trader_id: string | null;
  started_at: string | null;
  created_at: string;
  account_code: string | null;       // e.g. FW-MI41I7D0E1
  trading_account_id: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  passed:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired:  'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  funded:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

type StatusFilter = 'all' | 'active' | 'passed' | 'failed' | 'expired' | 'archived';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: 'All'      },
  { value: 'active',   label: 'Active'   },
  { value: 'passed',   label: 'Passed'   },
  { value: 'failed',   label: 'Failed'   },
  { value: 'expired',  label: 'Expired'  },
  { value: 'archived', label: 'Archived' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function FounderDeleteAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Delete / Archive modal
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteModalLabel, setDeleteModalLabel] = useState('');

  const fetchAccounts = useCallback(async (query: string, status: StatusFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (status !== 'all') params.set('status', status);
      params.set('page_size', '100');
      const res = await apiFetch(`/api/founder/trading-accounts/search?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Failed to load accounts');
      }
      const json = await res.json();
      setAccounts(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + when status tab changes (no query)
  useEffect(() => {
    fetchAccounts(activeQuery, statusFilter);
  }, [statusFilter, fetchAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    setActiveQuery(q);
    fetchAccounts(q, statusFilter);
  }

  function clearSearch() {
    setSearchInput('');
    setActiveQuery('');
    fetchAccounts('', statusFilter);
    searchRef.current?.focus();
  }

  function handleDeleteSuccess(action: 'archive' | 'permanent_delete', accountId: string) {
    setDeleteModalId(null);
    // Remove from list immediately regardless of action type
    // Archive → account becomes 'failed' with ARCHIVED_BY_FOUNDER tag (no longer shown as active)
    // Delete  → account is gone
    setAccounts((prev) => prev.filter((a) =>
      a.id !== accountId && a.trading_account_id !== accountId,
    ));
    // Re-fetch to confirm DB state
    setTimeout(() => fetchAccounts(activeQuery, statusFilter), 1500);
  }

  function openDeleteModal(account: AccountRow) {
    const label = account.account_code
      ? `${account.account_code}${account.type ? ` — ${account.type.replace(/_/g, ' ')}` : ''}`
      : `${account.id.slice(0, 14)}…${account.type ? ` — ${account.type.replace(/_/g, ' ')}` : ''}`;
    setDeleteModalLabel(label);
    // Always prefer trading_account_id — the API resolves both directions from either ID
    // If no trading account, fall back to challenge account id
    setDeleteModalId(account.trading_account_id ?? account.id);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-destructive" />
          Delete / Archive Accounts
        </h1>
        <p className="text-muted-foreground mt-1">
          Founder-only. Search by account code, email, or trader ID.
          All actions are recorded in the immutable audit log.
        </p>
      </div>

      {/* ── Warning banner ── */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm space-y-0.5">
          <p className="font-semibold text-destructive">Permanent Delete is irreversible.</p>
          <p className="text-muted-foreground">
            Archive hides the account and preserves all data.
            Permanent Delete purges credentials and removes the trading account row.
          </p>
        </div>
      </div>

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by account code (FW-MI41I7D0E1), email, trader ID…"
            className="w-full pl-9 pr-9 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="default" className="gap-2 shrink-0">
          <Search className="h-4 w-4" /> Search
        </Button>
        <button
          type="button"
          onClick={() => fetchAccounts(activeQuery, statusFilter)}
          className="px-3 py-2 rounded-md text-sm border hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </form>

      {/* Active search indicator */}
      {activeQuery && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing results for:</span>
          <span className="font-mono font-medium bg-muted px-2 py-0.5 rounded text-xs">
            {activeQuery}
          </span>
          <button
            onClick={clearSearch}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Status tabs (disabled during search) ── */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              // Re-run fetch with new status + current query
              fetchAccounts(activeQuery, tab.value);
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Results ── */}
      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{error}</p>
            <button
              onClick={() => fetchAccounts(activeQuery, statusFilter)}
              className="text-xs underline mt-1"
            >
              Retry
            </button>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          message={
            activeQuery
              ? `No accounts found for "${activeQuery}". Try an account code like FW-MI41I7D0E1, an email address, or a trader ID fragment.`
              : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}accounts found.`
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} shown
            {activeQuery ? ` for "${activeQuery}"` : ''}
          </p>
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDelete={() => openDeleteModal(account)}
            />
          ))}
        </div>
      )}

      {/* ── Delete / Archive Modal ── */}
      {deleteModalId && (
        <DeleteArchiveModal
          accountId={deleteModalId}
          accountLabel={deleteModalLabel}
          onClose={() => setDeleteModalId(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────────────────────
function AccountCard({
  account,
  onDelete,
}: {
  account: AccountRow;
  onDelete: () => void;
}) {
  const status = account.status ?? 'unknown';
  const isFunded = status === 'passed';
  const isArchived = status === 'archived';

  return (
    <Card className={isArchived ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: account info */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full shrink-0 ${
              status === 'active'   ? 'bg-blue-500'   :
              status === 'passed'   ? 'bg-green-500'  :
              status === 'failed'   ? 'bg-red-500'    :
              status === 'expired'  ? 'bg-gray-400'   :
              status === 'archived' ? 'bg-purple-500' :
              'bg-gray-300'
            }`} />

            <div className="min-w-0">
              {/* Account code (primary identifier) + status badge */}
              <div className="flex items-center gap-2 flex-wrap">
                {account.account_code ? (
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {account.account_code}
                  </span>
                ) : (
                  <span className="font-mono text-xs font-medium text-muted-foreground">
                    {account.id.slice(0, 18)}…
                  </span>
                )}
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'}`}>
                  {status}
                </span>
                {isFunded && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> Funded
                  </span>
                )}
              </div>

              {/* Metadata row */}
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {account.type && (
                  <span>{account.type.replace(/_/g, ' ')}</span>
                )}
                {account.initial_balance != null && (
                  <span className="font-medium text-foreground/70">
                    {formatCurrency(account.initial_balance)}
                  </span>
                )}
                {account.started_at && (
                  <span>Started {new Date(account.started_at).toLocaleDateString()}</span>
                )}
                {account.trader_id && (
                  <span className="font-mono opacity-60">
                    trader:{account.trader_id.slice(0, 8)}
                  </span>
                )}
                {/* Show challenge UUID dimly for reference */}
                <span className="font-mono opacity-40 text-[10px]">
                  id:{account.id.slice(0, 10)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isArchived ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={onDelete}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5 text-purple-500" /> Archived
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
