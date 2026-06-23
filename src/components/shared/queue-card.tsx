'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

interface QueueCardProps {
  name: string;
  count: number;
  oldestAge: string;
  averageWait: string;
  priorityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  warningThreshold: number;
  criticalThreshold: number;
  href: string;
}

/**
 * Compact operational queue visualization card.
 * Displays queue depth, age, priority breakdown with threshold-based color indicators.
 * Used on the Executive Command Center.
 */
export function QueueCard({
  name,
  count,
  oldestAge,
  averageWait,
  priorityBreakdown,
  warningThreshold,
  criticalThreshold,
  href,
}: QueueCardProps) {
  const severity =
    count >= criticalThreshold ? 'critical' :
    count >= warningThreshold ? 'warning' : 'normal';

  const borderColor = {
    critical: 'border-red-500/60',
    warning: 'border-amber-500/60',
    normal: 'border-border',
  }[severity];

  const countColor = {
    critical: 'text-red-500',
    warning: 'text-amber-500',
    normal: 'text-foreground',
  }[severity];

  return (
    <Link
      href={href}
      className={cn(
        'block rounded-md border p-3 max-h-[120px] bg-card hover:bg-accent/5 transition-colors',
        borderColor
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {name}
        </span>
        <span className={cn('text-lg font-bold tabular-nums leading-none', countColor)}>
          {count}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
        <span>Oldest: <strong className="text-foreground/80">{oldestAge}</strong></span>
        <span>Avg: <strong className="text-foreground/80">{averageWait}</strong></span>
      </div>

      {/* Priority breakdown bar */}
      <div className="flex items-center gap-1">
        {priorityBreakdown.critical > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-red-500">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {priorityBreakdown.critical}
          </span>
        )}
        {priorityBreakdown.high > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-orange-500">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            {priorityBreakdown.high}
          </span>
        )}
        {priorityBreakdown.medium > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {priorityBreakdown.medium}
          </span>
        )}
        {priorityBreakdown.low > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            {priorityBreakdown.low}
          </span>
        )}
      </div>
    </Link>
  );
}
