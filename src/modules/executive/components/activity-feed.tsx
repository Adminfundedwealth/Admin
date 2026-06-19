'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
}

const eventTypeColors: Record<string, string> = {
  registration: 'bg-blue-500',
  purchase: 'bg-green-500',
  challenge_pass: 'bg-emerald-500',
  challenge_fail: 'bg-red-500',
  funded: 'bg-purple-500',
  payout_request: 'bg-amber-500',
  payout_completed: 'bg-green-600',
  kyc_approved: 'bg-teal-500',
  kyc_rejected: 'bg-orange-500',
  risk_alert: 'bg-red-600',
};

/**
 * Live activity feed showing the 20 most recent significant events.
 * Updates in real-time via polling (5s interval).
 */
export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
    // Poll every 5 seconds for real-time feel
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchEvents() {
    try {
      const res = await fetch('/api/executive/activity');
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data || []);
      }
    } catch {
      // Silently fail — keep existing data
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Live Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 max-h-[500px] overflow-y-auto">
        {loading && events.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        )}
        {!loading && events.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
            <span
              className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${eventTypeColors[event.type] || 'bg-muted-foreground'}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{event.title}</p>
              <p className="text-xs text-muted-foreground truncate">{event.description}</p>
              <time className="text-[10px] text-muted-foreground">
                {formatDate(event.timestamp)}
              </time>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
