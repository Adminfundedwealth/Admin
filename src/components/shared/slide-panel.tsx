'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthMap = {
  sm: 'w-[380px]',
  md: 'w-[480px]',
  lg: 'w-[600px]',
};

/**
 * Right-side slide-over panel.
 * Replaces full-page navigation for detail views.
 * 40-50% viewport width. Shows summary, timeline, notes, quick actions.
 */
export function SlidePanel({ open, onClose, title, subtitle, children, width = 'md' }: SlidePanelProps) {
  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full border-l bg-background shadow-2xl flex flex-col transition-transform duration-200',
          widthMap[width],
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-label={title || 'Detail panel'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b shrink-0">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );
}
