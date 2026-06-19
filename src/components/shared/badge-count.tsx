import { cn } from '@/lib/utils';

interface BadgeCountProps {
  count: number;
  variant?: 'default' | 'destructive' | 'warning';
  className?: string;
}

/**
 * Badge count indicator for sidebar navigation items.
 */
export function BadgeCount({ count, variant = 'destructive', className }: BadgeCountProps) {
  if (count <= 0) return null;

  const display = count > 99 ? '99+' : count.toString();

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-bold rounded-full',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground',
        variant === 'warning' && 'bg-warning text-warning-foreground',
        variant === 'default' && 'bg-muted text-muted-foreground',
        className
      )}
      aria-label={`${count} items`}
    >
      {display}
    </span>
  );
}
