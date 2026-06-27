'use client';

import { useRealtimeFeed, type FeedEvent, type FeedCategory, type ConnectionStatus } from '@/hooks/use-realtime-feed';
import { cn } from '@/lib/utils';
import {
  UserPlus, ShoppingCart, Trophy, XCircle, Wallet, FileCheck, FileX,
  Ticket, AlertTriangle, LogIn, LogOut, FileText,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Icon & color mapping per event type
// ---------------------------------------------------------------------------

const eventConfig: Record<string, { icon: typeof UserPlus; color: string }> = {
  registration: { icon: UserPlus, color: 'text-blue-500' },
  purchase: { icon: ShoppingCart, color: 'text-green-500' },
  challenge_pass: { icon: Trophy, color: 'text-emerald-500' },
  challenge_fail: { icon: XCircle, color: 'text-red-400' },
  payout_request: { icon: Wallet, color: 'text-amber-500' },
  kyc_submission: { icon: FileText, color: 'text-blue-400' },
  kyc_approval: { icon: FileCheck, color: 'text-green-500' },
  kyc_rejection: { icon: FileX, color: 'text-red-400' },
  ticket_created: { icon: Ticket, color: 'text-indigo-400' },
  risk_alert: { icon: AlertTriangle, color: 'text-red-500' },
  staff_login: { icon: LogIn, color: 'text-muted-foreground' },
  staff_logout: { icon: LogOut, color: 'text-muted-foreground' },
  provisioning_update: { icon: ShoppingCart, color: 'text-cyan-500' },
  account_status: { icon: AlertTriangle, color: 'text-orange-500' },
  payment_event: { icon: Wallet, color: 'text-green-600' },
};

const categories: { value: FeedCategory; label: string }[] = [
  { value: 'registration', label: 'Users' },
  { value: 'purchase', label: 'Sales' },
  { value: 'payout_request', label: 'Payouts' },
  { value: 'kyc_submission', label: 'KYC' },
  { value: 'risk_alert', label: 'Risk' },
  { value: 'ticket_created', label: 'Support' },
  { value: 'provisioning_update', label: 'Provisioning' },
  { value: 'staff_login', label: 'Staff' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Real-time operations feed — permanent right-side activity stream.
 * Shows live company events: registrations, purchases, payouts, KYC, risk, tickets, staff.
 */
export function OperationsFeed() {
  const {
    events,
    connectionStatus,
    activeFilters,
    toggleFilter,
    loadMore,
    hasMore,
  } = useRealtimeFeed();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold">Operations Feed</h2>
        <ConnectionDot status={connectionStatus} />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1 px-4 py-2 border-b shrink-0">
        {categories.map((cat) => {
          const isActive = activeFilters.size === 0 || activeFilters.has(cat.value);
          return (
            <button
              key={cat.value}
              onClick={() => toggleFilter(cat.value)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors',
                isActive
                  ? 'bg-accent/20 text-accent-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            No activity yet. Events will appear here in real-time.
          </p>
        ) : (
          events.map((event) => <FeedEventRow key={event.id} event={event} />)
        )}

        {/* Load more */}
        {hasMore && events.length > 0 && (
          <button
            onClick={loadMore}
            className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-2"
          >
            Load older events...
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const color = {
    connected: 'bg-emerald-500',
    disconnected: 'bg-red-500',
    reconnecting: 'bg-amber-500 animate-pulse',
  }[status];

  const label = {
    connected: 'Live',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
  }[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} aria-label={`Connection: ${label}`} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function FeedEventRow({ event }: { event: FeedEvent }) {
  const config = eventConfig[event.type] ?? { icon: FileText, color: 'text-muted-foreground' };
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 py-1.5 group hover:bg-muted/30 rounded-sm px-1 -mx-1 transition-colors">
      <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', config.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-foreground leading-snug truncate">
          {event.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground truncate">{event.actor}</span>
          <span className="text-[10px] text-muted-foreground/60">{formatRelativeTime(event.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
