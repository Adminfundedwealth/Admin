'use client';

/**
 * useIsFounder
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight client-side hook that checks whether the current admin session
 * belongs to a Founder / Co-Founder by calling GET /api/auth/me.
 *
 * Returns:
 *   isFounder  – boolean (false while loading)
 *   loading    – true until the first check completes
 *
 * Cached in module-level memory so re-renders don't cause repeated requests.
 */

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/fetch';

let cachedIsFounder: boolean | null = null;
let cachePromise: Promise<boolean> | null = null;

async function resolveIsFounder(): Promise<boolean> {
  if (cachedIsFounder !== null) return cachedIsFounder;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) {
        cachedIsFounder = false;
        return false;
      }
      const json = await res.json();
      const isFullAccess: boolean = json?.data?.isFullAccess ?? false;
      cachedIsFounder = isFullAccess;
      return isFullAccess;
    } catch {
      cachedIsFounder = false;
      return false;
    }
  })();

  return cachePromise;
}

export function useIsFounder(): { isFounder: boolean; loading: boolean } {
  const [isFounder, setIsFounder] = useState<boolean>(cachedIsFounder ?? false);
  const [loading, setLoading] = useState<boolean>(cachedIsFounder === null);

  useEffect(() => {
    if (cachedIsFounder !== null) {
      setIsFounder(cachedIsFounder);
      setLoading(false);
      return;
    }
    resolveIsFounder().then((result) => {
      setIsFounder(result);
      setLoading(false);
    });
  }, []);

  return { isFounder, loading };
}
