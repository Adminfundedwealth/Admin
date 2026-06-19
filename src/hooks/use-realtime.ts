'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseRealtimeOptions {
  channel: string;
  table?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onMessage?: (payload: any) => void;
}

/**
 * Generic hook for Supabase Realtime subscriptions with auto-reconnection.
 */
export function useRealtime({ channel, table, event = '*', filter, onMessage }: UseRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    const sub = supabase.channel(channel)
      .on('postgres_changes', { event, schema: 'public', table: table || '*', filter }, (payload) => {
        onMessage?.(payload);
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(sub); };
  }, [channel, table, event, filter]);

  return { connected };
}

/**
 * Hook for staff-specific notification channel.
 */
export function useNotificationChannel(staffId: string, onNotification: (notification: any) => void) {
  return useRealtime({
    channel: `notifications:${staffId}`,
    table: 'notifications',
    event: 'INSERT',
    filter: `recipient_id=eq.${staffId}`,
    onMessage: (payload) => onNotification(payload.new),
  });
}
