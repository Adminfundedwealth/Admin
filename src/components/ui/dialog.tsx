'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// ─── Context / Root ───────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onOpenChange(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </>
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function DialogContent({ children, className, ...props }: DialogContentProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
        'w-full max-w-lg bg-background border rounded-xl shadow-2xl',
        'flex flex-col',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function DialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-1', className)} {...props}>
      {children}
    </div>
  );
}

// ─── Title ───────────────────────────────────────────────────────────────────

export function DialogTitle({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-base font-semibold leading-none', className)} {...props}>
      {children}
    </h2>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

export function DialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-end gap-2 pt-2', className)} {...props}>
      {children}
    </div>
  );
}
