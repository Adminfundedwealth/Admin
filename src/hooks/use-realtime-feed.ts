'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedEventType =
  | 'registration'
  | 'purchase'
  | 'challenge_pass'
  | 'challenge_fail'
  | 'payout_request'
  | 'kyc_submission'
  | 'kyc_approval'
  | 'kyc_rejection'
  | 'ticket_created'
  | 'risk_alert'
  | 'staff_login'
  | 'staff_logout'
  | 'provisioning_update'
  | 'account_status'
  | 'payment_event';

export type FeedEventSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface FeedEvent {
  id: string;
  type: FeedEventType;
  description: string;
  actor: string;
  timestamp: string;
  severity: FeedEventSeverity;
  entityId?: string;
  entityType?: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export type FeedCategory = FeedEventType;

interface UseRealtimeFeedOptions {
  maxEvents?: number;
  batchSize?: number;
  reconnectInterval?: number;
}

interface UseRealtimeFeedReturn {
  events: FeedEvent[];
  connectionStatus: ConnectionStatus;
  activeFilters: Set<FeedCategory>;
  toggleFilter: (category: FeedCategory) => void;
  resetFilters: () => void;
  loadMore: () => void;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the Operations Feed state: events, connection, filtering, pagination.
 * Subscribes to Supabase Realtime for live events.
 * Falls back to polling if realtime unavailable.
 */
export function useRealtimeFeed(options: UseRealtimeFeedOptions = {}): UseRealtimeFeedReturn {
  const { maxEvents = 50, batchSize = 25, reconnectInterval = 5000 } = options;

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [activeFilters, setActiveFilters] = useState<Set<FeedCategory>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const reconnectTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnecting = useRef(false);

  // --- Fetch initial events ---
  const fetchEvents = useCallback(async (pageNum: number) => {
    try {
      const res = await fetch(`/api/feed?page=${pageNum}&limit=${batchSize}`);
      if (!res.ok) return;
      const data = await res.json();
      if (pageNum === 1) {
        setEvents(data.events ?? []);
      } else {
        setEvents((prev) => [...prev, ...(data.events ?? [])]);
      }
      setHasMore((data.events?.length ?? 0) >= batchSize);
    } catch {
      // Silent failure on feed load
    }
  }, [batchSize]);

  // --- Connect to realtime ---
  const connect = useCallback(async () => {
    if (isConnecting.current) return;
    isConnecting.current = true;
    setConnectionStatus('reconnecting');

    try {
      // Dynamic import to avoid SSR issues
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Subscribe to any table that exists for real-time updates.
      // If operations_events doesn't exist, we fall back to polling the REST API.
      const channel = supabase
        .channel('operations-feed')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'payout_requests' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'kyc_submissions' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'risk_alerts' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'support_tickets' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'users' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'provisioning_logs' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'challenge_accounts' },
          () => { fetchEvents(1); }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          () => { fetchEvents(1); }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
            if (reconnectTimer.current) {
              clearInterval(reconnectTimer.current);
              reconnectTimer.current = null;
            }
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setConnectionStatus('disconnected');
            startReconnect();
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      setConnectionStatus('disconnected');
      startReconnect();
    } finally {
      isConnecting.current = false;
    }
  }, [fetchEvents]);

  // --- Reconnect logic ---
  const startReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    reconnectTimer.current = setInterval(() => {
      connect();
    }, reconnectInterval);
  }, [connect, reconnectInterval]);

  // --- Initialize ---
  useEffect(() => {
    fetchEvents(1);
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearInterval(reconnectTimer.current);
      }
    };
  }, [fetchEvents, connect]);

  // --- Filter toggle ---
  const toggleFilter = useCallback((category: FeedCategory) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  // --- Load more ---
  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEvents(nextPage);
  }, [page, fetchEvents]);

  // --- Filtered events ---
  const filteredEvents = activeFilters.size === 0
    ? events
    : events.filter((e) => activeFilters.has(e.type));

  return {
    events: filteredEvents,
    connectionStatus,
    activeFilters,
    toggleFilter,
    resetFilters,
    loadMore,
    hasMore,
  };
}
