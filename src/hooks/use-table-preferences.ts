'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Density } from '@/config/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sortOrder: { column: string; direction: 'asc' | 'desc' }[];
  createdAt: string;
}

export interface TablePreferences {
  density: Density;
  visibleColumns: string[];
  savedFilters: SavedFilter[];
}

interface UseTablePreferencesReturn {
  density: Density;
  setDensity: (d: Density) => void;
  visibleColumns: string[];
  setVisibleColumns: (cols: string[]) => void;
  toggleColumn: (col: string, allColumns: string[]) => void;
  savedFilters: SavedFilter[];
  saveFilter: (name: string, filters: Record<string, unknown>, sortOrder: { column: string; direction: 'asc' | 'desc' }[]) => void;
  deleteFilter: (id: string) => void;
  loadFilter: (id: string) => SavedFilter | undefined;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'fw-table-';
const MAX_SAVED_FILTERS = 10;
const MIN_VISIBLE_COLUMNS = 3;

function readPrefs(tableId: string): Partial<TablePreferences> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePrefs(tableId: string, prefs: TablePreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(prefs));
  } catch {
    // Quota exceeded — fail silently
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTablePreferences(
  tableId: string,
  defaultColumns: string[] = []
): UseTablePreferencesReturn {
  const [prefs, setPrefs] = useState<TablePreferences>(() => {
    const stored = readPrefs(tableId);
    return {
      density: stored.density ?? 'default',
      visibleColumns: stored.visibleColumns ?? defaultColumns,
      savedFilters: stored.savedFilters ?? [],
    };
  });

  // Persist on change
  useEffect(() => {
    writePrefs(tableId, prefs);
  }, [tableId, prefs]);

  const setDensity = useCallback((density: Density) => {
    setPrefs((prev) => ({ ...prev, density }));
  }, []);

  const setVisibleColumns = useCallback((cols: string[]) => {
    if (cols.length < MIN_VISIBLE_COLUMNS) return; // Enforce minimum
    setPrefs((prev) => ({ ...prev, visibleColumns: cols }));
  }, []);

  const toggleColumn = useCallback((col: string, allColumns: string[]) => {
    setPrefs((prev) => {
      const current = prev.visibleColumns.length > 0 ? prev.visibleColumns : allColumns;
      const isVisible = current.includes(col);

      if (isVisible) {
        // Don't allow less than 3 visible
        if (current.length <= MIN_VISIBLE_COLUMNS) return prev;
        return { ...prev, visibleColumns: current.filter((c) => c !== col) };
      } else {
        return { ...prev, visibleColumns: [...current, col] };
      }
    });
  }, []);

  const saveFilter = useCallback(
    (name: string, filters: Record<string, unknown>, sortOrder: { column: string; direction: 'asc' | 'desc' }[]) => {
      setPrefs((prev) => {
        if (prev.savedFilters.length >= MAX_SAVED_FILTERS) return prev;
        const newFilter: SavedFilter = {
          id: crypto.randomUUID(),
          name,
          filters,
          sortOrder,
          createdAt: new Date().toISOString(),
        };
        return { ...prev, savedFilters: [...prev.savedFilters, newFilter] };
      });
    },
    []
  );

  const deleteFilter = useCallback((id: string) => {
    setPrefs((prev) => ({
      ...prev,
      savedFilters: prev.savedFilters.filter((f) => f.id !== id),
    }));
  }, []);

  const loadFilter = useCallback(
    (id: string) => prefs.savedFilters.find((f) => f.id === id),
    [prefs.savedFilters]
  );

  return {
    density: prefs.density,
    setDensity,
    visibleColumns: prefs.visibleColumns,
    setVisibleColumns,
    toggleColumn,
    savedFilters: prefs.savedFilters,
    saveFilter,
    deleteFilter,
    loadFilter,
  };
}
