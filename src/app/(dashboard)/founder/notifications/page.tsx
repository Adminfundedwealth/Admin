'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';

/**
 * Notifications Center — reads live notifications from notifications table.
 * Reads: notifications (via /api/founder/notifications)
 * Writes: notifications (mark read via PATCH)
 */

interface NotificationItem {
  id: string;
  recipient_id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  event_source: string;
  link_to: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

const priorityColors: Record<string, string> = {
  critical: 'border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
  high: 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10',
  medium: 'border-l-4 border-l-blue-500',
  low: 'border-l-4 border-l-gray-300',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [showUnreadOnly]);

  async function fetchNotifications() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (showUnreadOnly) params.set('unread', 'true');
      const res = await apiFetch(`/api/founder/notifications?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setNotifications(json.data || []);
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    try {
      await apiFetch('/api/founder/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  async function markRead(ids: string[]) {
    try {
      await apiFetch('/api/founder/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - ids.length));
    } catch {
      // ignore
    }
  }

  function formatTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (error) return <ErrorState message={error} onRetry={fetchNotifications} />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            System events and alerts
            {unreadCount > 0 && <span className="ml-2 text-xs font-medium text-primary">({unreadCount} unread)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showUnreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            {showUnreadOnly ? 'Showing Unread' : 'Show Unread'}
          </Button>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1.5">
              <CheckCheck className="h-3.5 w-3.5" /> Mark All Read
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState rows={8} />
      ) : notifications.length === 0 ? (
        <EmptyState message={showUnreadOnly ? 'No unread notifications.' : 'No notifications yet.'} />
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              className={`${priorityColors[notif.priority] || ''} ${!notif.read ? 'bg-accent/30' : 'opacity-70'}`}
              onClick={() => !notif.read && markRead([notif.id])}
            >
              <CardContent className="p-4 flex items-start gap-3 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${notif.read ? '' : 'font-semibold'}`}>{notif.title}</p>
                    {!notif.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{formatTime(notif.created_at)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{notif.event_source}</span>
                  </div>
                </div>
                {notif.link_to && (
                  <Link href={notif.link_to} className="shrink-0 text-primary hover:underline">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
