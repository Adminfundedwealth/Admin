'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';

export interface RowAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'destructive' | 'ghost';
  requiresReason?: boolean;
  onClick: () => void;
}

interface RowActionsProps {
  actions: RowAction[];
}

/**
 * Inline row actions — appears on hover as a dropdown.
 * Replaces full-page navigation for common operations.
 */
export function RowActions({ actions }: RowActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-lg border bg-background p-1 shadow-lg">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={(e) => { e.stopPropagation(); action.onClick(); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors text-left ${
                  action.variant === 'destructive'
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'hover:bg-accent'
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
