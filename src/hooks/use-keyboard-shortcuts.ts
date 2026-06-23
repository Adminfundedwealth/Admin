'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Global keyboard shortcut manager.
 * Implements:
 * - Ctrl+K → Command Palette (handled by CommandPalette)
 * - Ctrl+I → Impersonation
 * - Ctrl+E → Emergency Controls
 * - G U → Go to Users
 * - G P → Go to Payouts
 * - G C → Go to Challenges
 * - G R → Go to Risk
 * - G S → Go to Support
 * - G A → Go to Audit
 * - J/K → Navigate rows (handled by DataTable)
 * - Enter → Open selected row
 * - Escape → Close panel / Go back
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const pendingG = useRef(false);
  const gTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // Ctrl+I → Impersonation
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        router.push('/founder/impersonate');
        return;
      }

      // Ctrl+E → Emergency
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        router.push('/founder/emergency');
        return;
      }

      // Ctrl+N → Notifications
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        router.push('/founder/notifications');
        return;
      }

      // G + second key → Go to navigation
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!pendingG.current) {
          pendingG.current = true;
          gTimeout.current = setTimeout(() => { pendingG.current = false; }, 500);
        }
        return;
      }

      if (pendingG.current) {
        pendingG.current = false;
        if (gTimeout.current) clearTimeout(gTimeout.current);

        const routes: Record<string, string> = {
          u: '/users',
          p: '/payouts',
          c: '/challenges',
          r: '/risk',
          s: '/support',
          a: '/audit',
          f: '/funded',
          t: '/trades',
          e: '/executive',
          m: '/marketing',
          k: '/kyc',
          o: '/orders',
        };

        if (routes[e.key]) {
          e.preventDefault();
          router.push(routes[e.key]);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router]);
}
