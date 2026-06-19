'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  actor?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface TimelineProps {
  events: TimelineEvent[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  className?: string;
  defaultLimit?: number;
}

/**
 * Timeline component for displaying event history in reverse chronological order.
 * Shows 50 events by default with load-more pagination.
 */
export function Timeline({
  events,
  hasMore = false,
  onLoadMore,
  loading = false,
  className,
}: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No events to display.
      </div>
    );
  }

  return (
    <div className={cn('space-y-0', className)}>
      <div className="relative pl-6 border-l-2 border-muted space-y-4">
        {events.map((event) => (
          <div key={event.id} className="relative">
            {/* Dot indicator */}
            <div className="absolute -left-[25px] top-1 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/30" />

            <div className="pb-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium">{event.title}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {event.type}
                </span>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {event.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time>
                {event.actor && <span>by {event.actor}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="pt-4 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
