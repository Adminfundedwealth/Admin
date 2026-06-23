'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/providers/theme-provider';
import { useLayout } from '@/hooks/use-layout';
import { Activity, Bell, LogOut, Moon, Sun, Search, Command, Eye, Shield, Sparkles } from 'lucide-react';

export function Header() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { feedVisible, toggleFeed } = useLayout();
  const [notificationCount] = useState(3);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'dark' : 'light');
  }

  function openCommandPalette() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }

  function openCopilot() {
    document.dispatchEvent(new CustomEvent('toggle-copilot'));
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl relative">
      <div className="flex h-12 items-center justify-between px-4">
        {/* Left: Breadcrumb + Search */}
        <div className="flex items-center gap-3">
          <button
            onClick={openCommandPalette}
            className="flex items-center gap-2 h-8 px-3 text-xs text-muted-foreground rounded-md border bg-muted/40 hover:bg-muted transition-colors w-56"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search or jump to...</span>
            <kbd className="inline-flex h-4 items-center gap-0.5 rounded border px-1 font-mono text-[9px] text-muted-foreground bg-background">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1">
          {/* Impersonate shortcut */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push('/founder/impersonate')}
            aria-label="Impersonate"
            title="Impersonate staff member"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>

          {/* Emergency */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push('/founder/emergency')}
            aria-label="Emergency controls"
            title="Emergency controls"
          >
            <Shield className="h-3.5 w-3.5" />
          </Button>

          {/* Copilot trigger */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={openCopilot}
            aria-label="Operations Copilot"
            title="Operations Copilot (Ctrl+J)"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>

          {/* Connection status dot */}
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
            title="Connected"
            aria-label="Connection status: connected"
          />

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => router.push('/founder/notifications')}
            aria-label={`Notifications (${notificationCount} unread)`}
          >
            <Bell className="h-3.5 w-3.5" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground">
                {notificationCount}
              </span>
            )}
          </Button>

          {/* Feed toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${feedVisible ? 'bg-accent/20 text-accent-foreground' : ''}`}
            onClick={toggleFeed}
            aria-label="Toggle operations feed"
            title="Toggle Operations Feed"
          >
            <Activity className="h-3.5 w-3.5" />
          </Button>

          {/* Theme */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>

          {/* Divider */}
          <div className="w-px h-5 bg-border mx-1" />

          {/* User / Logout */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Non-blocking progress indicator for background operations */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent/60 opacity-0 transition-opacity duration-300"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        aria-label="Background operation progress"
        data-progress-bar
      />
    </header>
  );
}
