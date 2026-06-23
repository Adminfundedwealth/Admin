'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Density, rowHeight } from '@/config/theme';
import { cn } from '@/lib/utils';
import { AlignJustify, List, Menu } from 'lucide-react';

interface DensityControlProps {
  tableId: string;
  value?: Density;
  onChange?: (density: Density) => void;
}

const STORAGE_PREFIX = 'fw-density-';

const densityOptions: { value: Density; icon: typeof AlignJustify; label: string }[] = [
  { value: 'compact', icon: AlignJustify, label: 'Compact' },
  { value: 'default', icon: List, label: 'Default' },
  { value: 'comfortable', icon: Menu, label: 'Comfortable' },
];

/**
 * Three-segment toggle for table row density.
 * Persists per-table preference in localStorage.
 */
export function DensityControl({ tableId, value, onChange }: DensityControlProps) {
  const [density, setDensity] = useState<Density>(value ?? 'default');

  // Read persisted value on mount
  useEffect(() => {
    if (value !== undefined) return; // Controlled mode
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
      if (stored && (stored === 'compact' || stored === 'default' || stored === 'comfortable')) {
        setDensity(stored as Density);
      }
    } catch {
      // localStorage unavailable
    }
  }, [tableId, value]);

  const handleChange = useCallback(
    (newDensity: Density) => {
      setDensity(newDensity);
      onChange?.(newDensity);
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, newDensity);
      } catch {
        // localStorage quota exceeded
      }
    },
    [tableId, onChange]
  );

  const current = value ?? density;

  return (
    <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5" role="radiogroup" aria-label="Table density">
      {densityOptions.map((opt) => {
        const Icon = opt.icon;
        const isActive = current === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={isActive}
            aria-label={opt.label}
            title={`${opt.label} (${rowHeight[opt.value]}px rows)`}
            onClick={() => handleChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center h-6 w-6 rounded-sm transition-colors',
              isActive ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3 w-3" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hook to read density preference for a specific table.
 */
export function useDensity(tableId: string): Density {
  const [density, setDensity] = useState<Density>('default');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
      if (stored && (stored === 'compact' || stored === 'default' || stored === 'comfortable')) {
        setDensity(stored as Density);
      }
    } catch {
      // localStorage unavailable
    }

    // Listen for storage changes from other tabs/components
    function handleStorage(e: StorageEvent) {
      if (e.key === `${STORAGE_PREFIX}${tableId}` && e.newValue) {
        setDensity(e.newValue as Density);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [tableId]);

  return density;
}
