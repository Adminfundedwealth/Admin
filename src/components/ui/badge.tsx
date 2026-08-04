import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
        variant === 'default' && 'bg-primary text-primary-foreground border-primary',
        variant === 'secondary' && 'bg-muted text-muted-foreground border-transparent',
        variant === 'outline' && 'bg-transparent text-foreground border-border',
        variant === 'destructive' && 'bg-destructive/10 text-destructive border-destructive/30',
        className,
      )}
      {...props}
    />
  );
}
