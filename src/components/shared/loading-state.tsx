import { cn } from '@/lib/utils';

interface LoadingStateProps {
  className?: string;
  rows?: number;
}

/**
 * Skeleton loading state displayed when data request exceeds 300ms.
 */
export function LoadingState({ className, rows = 5 }: LoadingStateProps) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-md border">
        {/* Header row */}
        <div className="flex gap-4 p-3 border-b bg-muted/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-muted animate-pulse rounded" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 p-3 border-b last:border-0">
            {Array.from({ length: 5 }).map((_, j) => (
              <div
                key={j}
                className="h-4 flex-1 bg-muted animate-pulse rounded"
                style={{ animationDelay: `${(i * 5 + j) * 50}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading content...</span>
    </div>
  );
}
