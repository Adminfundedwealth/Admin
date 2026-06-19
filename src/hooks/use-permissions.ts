'use client';

import { useState, useEffect } from 'react';
import type { Permission } from '@/types/permissions';

/**
 * Client-side permission hook.
 * Fetches and caches the current staff member's permissions.
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setPermissions(new Set(data.permissions || []));
        }
      } catch {} finally { setLoading(false); }
    }
    fetchPermissions();
  }, []);

  function hasPermission(permission: Permission): boolean {
    return permissions.has(permission) || permissions.has('*');
  }

  function hasAnyPermission(perms: Permission[]): boolean {
    return perms.some((p) => permissions.has(p)) || permissions.has('*');
  }

  return { permissions, hasPermission, hasAnyPermission, loading };
}
