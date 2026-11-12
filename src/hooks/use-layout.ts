'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// localStorage keys
const STORAGE_KEY_NAV = 'fw-admin-nav-collapsed';
const STORAGE_KEY_FEED = 'fw-admin-feed-visible';

export interface LayoutState {
  navCollapsed: boolean;
  feedVisible: boolean;
  feedMode: 'panel' | 'overlay';
  toggleNav: () => void;
  toggleFeed: () => void;
  setFeedVisible: (visible: boolean) => void;
}

const LayoutContext = createContext<LayoutState | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === 'true';
  } catch {
    return fallback;
  }
}

function writeBoolean(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isExecutive = pathname === '/executive';

  // feedMode is derived from current route
  const feedMode: 'panel' | 'overlay' = isExecutive ? 'panel' : 'overlay';

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [feedVisible, setFeedVisibleState] = useState(isExecutive);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    if (preferencesLoaded) return;
    setNavCollapsed(readBoolean(STORAGE_KEY_NAV, false));
    setFeedVisibleState(readBoolean(STORAGE_KEY_FEED, isExecutive));
    setPreferencesLoaded(true);
  }, [isExecutive, preferencesLoaded]);

  // Persist navCollapsed
  useEffect(() => {
    if (!preferencesLoaded) return;
    writeBoolean(STORAGE_KEY_NAV, navCollapsed);
  }, [navCollapsed, preferencesLoaded]);

  // Persist feedVisible
  useEffect(() => {
    if (!preferencesLoaded) return;
    writeBoolean(STORAGE_KEY_FEED, feedVisible);
  }, [feedVisible, preferencesLoaded]);

  const toggleNav = useCallback(() => {
    setNavCollapsed((prev) => !prev);
  }, []);

  const toggleFeed = useCallback(() => {
    setFeedVisibleState((prev) => !prev);
  }, []);

  const setFeedVisible = useCallback((visible: boolean) => {
    setFeedVisibleState(visible);
  }, []);

  const value: LayoutState = {
    navCollapsed,
    feedVisible,
    feedMode,
    toggleNav,
    toggleFeed,
    setFeedVisible,
  };

  return React.createElement(LayoutContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the Mission Control Layout state (nav collapse, feed visibility, feed mode).
 * Must be used within a LayoutProvider.
 */
export function useLayout(): LayoutState {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
