'use client';

import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  comparisonLabel?: string;
  sparklineData?: number[];
  className?: string;
}

/**
 * Executive KPI card with delta indicator and optional sparkline.
 * Used in the Revenue Health, Risk Health, and Operational Queues sections.
 *
 * Display: current value (display typography), delta (absolute change),
 * percentage change, trend arrow (up/down/neutral).
 */
export function KPICard({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  comparisonLabel = 'vs yesterday',
  sparklineData,
  className,
}: KPICardProps) {
  const computedTrend = trend ?? (delta === undefined ? 'neutral' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral');

  const trendColor = {
    up: 'text-emerald-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground',
  }[computedTrend];

  const TrendIcon = {
    up: ArrowUp,
    down: ArrowDown,
    neutral: Minus,
  }[computedTrend];

  return (
    <div className={cn('rounded-md border bg-card p-3 flex flex-col justify-between min-h-[80px] max-h-[100px]', className)}>
      {/* Label */}
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
        {label}
      </span>

      {/* Value + Sparkline */}
      <div className="flex items-end justify-between mt-1">
        <div className="flex flex-col">
          <span className="text-xl font-semibold tabular-nums leading-none">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>

          {/* Delta row */}
          {delta !== undefined && (
            <div className={cn('flex items-center gap-1 mt-1', trendColor)}>
              <TrendIcon className="h-2.5 w-2.5" />
              <span className="text-[10px] font-medium tabular-nums">
                {delta > 0 ? '+' : ''}{deltaLabel ?? `${delta.toFixed(1)}%`}
              </span>
              <span className="text-[9px] text-muted-foreground ml-0.5">{comparisonLabel}</span>
            </div>
          )}
        </div>

        {/* Mini sparkline */}
        {sparklineData && sparklineData.length > 1 && (
          <MiniSparkline data={sparklineData} trend={computedTrend} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Sparkline (pure SVG, no dependencies)
// ---------------------------------------------------------------------------

function MiniSparkline({ data, trend }: { data: number[]; trend: 'up' | 'down' | 'neutral' }) {
  const width = 80;
  const height = 32;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const strokeColor = {
    up: '#10b981',
    down: '#ef4444',
    neutral: '#71717a',
  }[trend];

  return (
    <svg
      width={width}
      height={height}
      className="shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
