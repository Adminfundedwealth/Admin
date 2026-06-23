'use client';

import { useState, useEffect, useCallback } from 'react';

interface RecentItem {
  id: string;
  type: string;
  title: string;
  href: string;
  timestamp: number;
}

const STORAGE_KEY = 'fw_admin_recent_items';
const MAX_ITEMS = 20;

/**
 * Track recently viewed items using localStorage.
 * Provides addRecent() and getRecent() for founder productivity.
 */
export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setItems(JSON.parse(stored)); } catch {}
    }
  }, []);

  const addRecent = useCallback((item: Omit<RecentItem, 'timestamp'>) => {
    setItems(prev => {
      const filtered = prev.filter(i => i.id !== item.id);
      const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { recentItems: items, addRecent, clearRecent };
}

const FAVORITES_KEY = 'fw_admin_favorites';

interface FavoriteItem {
  id: string;
  type: string;
  title: string;
  href: string;
}

/**
 * Favorites/pinned items using localStorage.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      try { setFavorites(JSON.parse(stored)); } catch {}
    }
  }, []);

  const addFavorite = useCallback((item: FavoriteItem) => {
    setFavorites(prev => {
      if (prev.find(f => f.id === item.id)) return prev;
      const updated = [item, ...prev];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const updated = prev.filter(f => f.id !== id);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isFavorite = useCallback((id: string) => {
    return favorites.some(f => f.id === id);
  }, [favorites]);

  return { favorites, addFavorite, removeFavorite, isFavorite };
}
