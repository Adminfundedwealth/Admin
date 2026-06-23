'use client';

import {
  type StatusVariant,
  statusColorMap,
  statusColors,
} from '@/config/theme';

interface StatusBadgeProps {
  status: StatusVariant | string;
  size?: 'sm' | 'md';
  animate?: boolean;
}

export function StatusBadge({ status, size = 'md', animate = false }: StatusBadgeProps) {
  const colorGroup = statusColorMap[status as StatusVariant] ?? (() => {
    console.warn(`[StatusBadge] Unknown status: "${status}". Defaulting to gray.`);
    return 'gray' as const;
  })();

  const { dot, bg, text } = statusColors[colorGroup];

  // Format label: replace hyphens with spaces, capitalize first letter
  const label = status.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  const isSm = size === 'sm';

  const rootClasses = [
    'inline-flex items-center rounded-full',
    isSm ? 'gap-1 px-1.5' : 'gap-1.5 px-2 py-0.5',
    bg,
    text,
    animate ? 'transition-colors duration-150' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dotClasses = [
    'rounded-full',
    isSm ? 'h-1 w-1' : 'h-1.5 w-1.5',
    dot,
  ].join(' ');

  const labelClasses = [
    'font-medium capitalize',
    isSm ? 'text-[10px]' : 'text-[11px]',
  ].join(' ');

  return (
    <span className={rootClasses}>
      <span className={dotClasses} />
      <span className={labelClasses}>{label}</span>
    </span>
  );
}
