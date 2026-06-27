'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Supabase Realtime subscription hook.
 * Subscribes to table changes via Supabase Realtime.
 * Used for live updates across the Admin Panel.
 *
 * Usage:
 *   useRealtime('risk_alerts', 'INSERT', (payload) => { ... });
 *   useRealtime('orders', '*', (payload) => { ... });
 *   useRealtime('payout_requests', 'UPDATE', (payload) => { ... }, { filter: 'status=eq.pending' });
 */
type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  filter?: string;
  schema?: string;
  enabled?: boolean;
}

export function useRealtime<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  event: EventType,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  options?: UseRealtimeOptions
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabled = options?.enabled !== false;
  const schema = options?.schema || 'public';
  const filter = options?.filter;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = `admin-${table}-${event}-${filter || 'all'}`;

    const channelConfig: any = {
      event: event === '*' ? '*' : event,
      schema,
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig, (payload: any) => {
        callbackRef.current(payload);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, event, schema, filter, enabled]);
}

/**
 * Multi-table realtime subscription for the Operations Feed.
 * Subscribes to multiple tables for aggregated live updates.
 */
export function useMultiRealtime(
  subscriptions: { table: string; event: EventType; filter?: string }[],
  callback: (table: string, payload: any) => void,
  enabled = true
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || subscriptions.length === 0) return;

    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    for (const sub of subscriptions) {
      const channelName = `admin-multi-${sub.table}-${sub.event}-${Date.now()}`;
      const channelConfig: any = {
        event: sub.event === '*' ? '*' : sub.event,
        schema: 'public',
        table: sub.table,
      };
      if (sub.filter) channelConfig.filter = sub.filter;

      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', channelConfig, (payload: any) => {
          callbackRef.current(sub.table, payload);
        })
        .subscribe();

      channels.push(channel);
    }

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch);
      }
    };
  }, [JSON.stringify(subscriptions), enabled]);
}
