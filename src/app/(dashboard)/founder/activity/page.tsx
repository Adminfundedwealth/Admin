'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';

/**
 * Staff Activity Feed — reads from audit_records table via /api/founder/activity.
 * Reads: audit_records, staff_members, staff_role_assignments, roles
 * Writes: none
 */

interface ActivityEntry {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  action: string;
  targetEntityType: string;
  targetEntityId: string;
  ipAddress: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

export default function StaffActivityPage() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchActivity();
  }, [filter]);

  async function fetchActivity() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      const res = await apiFetch(`/api/founder/activity?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch activity');
      const json = await res.json();
      setActivities(json.data || []);
      setTotalCount(json.meta?.totalCount || 0);
    } catch {
      setError('Failed to load activity feed.');
    } finally {
      setLoading(false);
    }
  }

  function formatTimestamp(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  if (error) return <ErrorState message={error} onRetry={fetchActivity} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Activity Feed</h1>
          <p className="text-muted-foreground">
            Real-time visibility into all staff actions across the system
            {totalCount > 0 && <span className="ml-2 text-xs">({totalCount} total records)</span>}
          </p>
        </div>
        <div className="flex gap-1">
          {['all', 'mutations', 'logins', 'exports'].map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize text-xs"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState rows={10} />
      ) : activities.length === 0 ? (
        <EmptyState message="No activity records found for this filter." />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {activities.map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/30 transition-colors">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {entry.staffName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{entry.staffName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entry.staffRole}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    <span className="font-mono text-xs bg-muted px-1 rounded">{entry.action}</span>
                    {' → '}
                    <span className="font-mono text-xs">{entry.targetEntityType}/{entry.targetEntityId.slice(0, 8)}...</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{entry.ipAddress}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
