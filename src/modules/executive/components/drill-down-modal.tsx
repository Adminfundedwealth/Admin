'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Loader2, Users, Trophy, TrendingUp, UserCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

export type DrillDownType = 'active_users' | 'active_challenges' | 'funded_accounts' | 'staff_online' | null;

interface DrillDownModalProps {
  type: DrillDownType;
  onClose: () => void;
}

const CONFIG: Record<
  NonNullable<DrillDownType>,
  { title: string; icon: React.ElementType; accent: string; description: string }
> = {
  active_users: {
    title: 'Active Users',
    icon: Users,
    accent: 'text-blue-600',
    description: 'Users active in the last 30 days',
  },
  active_challenges: {
    title: 'Active Challenges',
    icon: Trophy,
    accent: 'text-purple-600',
    description: 'Challenge accounts currently in progress',
  },
  funded_accounts: {
    title: 'Funded Accounts',
    icon: TrendingUp,
    accent: 'text-emerald-600',
    description: 'Accounts that passed evaluation',
  },
  staff_online: {
    title: 'Staff Online',
    icon: UserCheck,
    accent: 'text-green-600',
    description: 'Staff with activity in the last 30 minutes',
  },
};

export function DrillDownModal({ type, onClose }: DrillDownModalProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/executive/drill-down?type=${type}`);
      if (!res.ok) throw new Error('Failed to load data');
      const json = await res.json();
      setRows(json.rows || []);
      setCount(json.count || 0);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (type) {
      setSearch('');
      setRows([]);
      fetchData();
    }
  }, [type, fetchData]);

  if (!type) return null;

  const cfg = CONFIG[type];
  const Icon = cfg.icon;

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.accountNumber && r.accountNumber.toLowerCase().includes(q)) ||
      (r.id && r.id.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog open={!!type} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-4.5 w-4.5 ${cfg.accent}`} />
              <DialogTitle className="text-base font-semibold">{cfg.title}</DialogTitle>
              {!loading && (
                <Badge variant="secondary" className="text-[11px] h-5">
                  {count.toLocaleString()}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fetchData}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{cfg.description}</p>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 py-2.5 border-b flex-shrink-0">
          <input
            type="text"
            placeholder="Search by email, name, account number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 rounded-md border bg-background px-3 text-[12px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-0">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <p className="text-sm text-red-500">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              {search ? 'No results match your search.' : 'No records found.'}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <>
              {type === 'active_users' && <ActiveUsersTable rows={filtered} />}
              {type === 'active_challenges' && <ActiveChallengesTable rows={filtered} />}
              {type === 'funded_accounts' && <FundedAccountsTable rows={filtered} />}
              {type === 'staff_online' && <StaffOnlineTable rows={filtered} />}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && filtered.length > 0 && (
          <div className="px-5 py-2.5 border-t flex-shrink-0 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Showing {filtered.length.toLocaleString()} of {count.toLocaleString()} records
              {count >= 100 && ' (limited to 100)'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {search && `Filtered by "${search}"`}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Table: Active Users
// ---------------------------------------------------------------------------
function ActiveUsersTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
        <tr>
          <Th>Email</Th>
          <Th>Name</Th>
          <Th>Location</Th>
          <Th>KYC</Th>
          <Th>Status</Th>
          <Th>Joined</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={`border-b hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
            <Td className="font-mono text-[11px]">{r.email}</Td>
            <Td>{r.name}</Td>
            <Td className="text-muted-foreground">{r.location}</Td>
            <Td>
              <KYCBadge status={r.kycStatus} />
            </Td>
            <Td>
              <span className={r.isActive ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
                {r.isActive ? 'Active' : 'Inactive'}
              </span>
            </Td>
            <Td className="text-muted-foreground">{shortDate(r.joinedAt)}</Td>
            <Td>
              <a
                href={`/users/${r.id}`}
                className="text-primary hover:underline flex items-center gap-0.5"
                title="View user"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Table: Active Challenges
// ---------------------------------------------------------------------------
function ActiveChallengesTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
        <tr>
          <Th>Email</Th>
          <Th>Trader ID</Th>
          <Th>Type</Th>
          <Th>Plan</Th>
          <Th>Balance</Th>
          <Th>P&L%</Th>
          <Th>Started</Th>
          <Th>Expires</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={`border-b hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
            <Td className="font-mono text-[11px]">{r.email}</Td>
            <Td className="font-mono text-[11px] text-muted-foreground">{r.traderId?.slice(0, 12)}…</Td>
            <Td className="text-muted-foreground">{r.type}</Td>
            <Td>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {r.plan || '—'}
              </Badge>
            </Td>
            <Td>{formatCurrency(r.currentBalance)}</Td>
            <Td>
              <span className={r.profitPct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                {r.profitPct >= 0 ? '+' : ''}{r.profitPct?.toFixed(2)}%
              </span>
            </Td>
            <Td className="text-muted-foreground">{shortDate(r.startedAt)}</Td>
            <Td className="text-muted-foreground">{r.expiresAt ? shortDate(r.expiresAt) : '—'}</Td>
            <Td>
              <a
                href={`/challenges/${r.id}`}
                className="text-primary hover:underline flex items-center gap-0.5"
                title="View challenge"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Table: Funded Accounts
// ---------------------------------------------------------------------------
function FundedAccountsTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
        <tr>
          <Th>Email</Th>
          <Th>Trader ID</Th>
          <Th>Type</Th>
          <Th>Plan</Th>
          <Th>Start Balance</Th>
          <Th>Current Balance</Th>
          <Th>P&L</Th>
          <Th>Funded At</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={`border-b hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
            <Td className="font-mono text-[11px]">{r.email}</Td>
            <Td className="font-mono text-[11px] text-muted-foreground">{r.traderId?.slice(0, 12)}…</Td>
            <Td className="text-muted-foreground">{r.type}</Td>
            <Td>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {r.plan || '—'}
              </Badge>
            </Td>
            <Td>{formatCurrency(r.initialBalance)}</Td>
            <Td>{formatCurrency(r.currentBalance)}</Td>
            <Td>
              <span className={r.profitLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                {r.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(r.profitLoss))}
              </span>
            </Td>
            <Td className="text-muted-foreground">{r.fundedAt ? shortDate(r.fundedAt) : '—'}</Td>
            <Td>
              <a
                href={`/funded/${r.id}`}
                className="text-primary hover:underline flex items-center gap-0.5"
                title="View funded account"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Table: Staff Online
// ---------------------------------------------------------------------------
function StaffOnlineTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
        <tr>
          <Th>Status</Th>
          <Th>Name</Th>
          <Th>Email</Th>
          <Th>Last Activity</Th>
          <Th>Session Started</Th>
          <Th>Browser</Th>
          <Th>OS</Th>
          <Th>IP Address</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.sessionId} className={`border-b hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
            <Td>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-600 font-medium">Online</span>
              </span>
            </Td>
            <Td className="font-medium">{r.name}</Td>
            <Td className="font-mono text-[11px]">{r.email}</Td>
            <Td>
              <span className="text-muted-foreground">{relativeTime(r.lastActivity)}</span>
            </Td>
            <Td className="text-muted-foreground">{relativeTime(r.sessionStarted)}</Td>
            <Td className="text-muted-foreground">{r.browser}</Td>
            <Td className="text-muted-foreground">{r.os}</Td>
            <Td className="font-mono text-[11px] text-muted-foreground">{r.ipAddress || '—'}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-2 whitespace-nowrap ${className || ''}`}>
      {children}
    </td>
  );
}

function KYCBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    verified: { label: 'Verified', class: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30' },
    pending: { label: 'Pending', class: 'bg-amber-500/20 text-amber-700 border-amber-500/30' },
    submitted: { label: 'Submitted', class: 'bg-blue-500/20 text-blue-700 border-blue-500/30' },
    rejected: { label: 'Rejected', class: 'bg-red-500/20 text-red-700 border-red-500/30' },
  };
  const cfg = map[status] || { label: status, class: '' };
  return <Badge className={`text-[10px] h-4 px-1 ${cfg.class}`}>{cfg.label}</Badge>;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
