'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, Users, Trophy, TrendingUp, Wallet, ShieldCheck,
  AlertTriangle, Activity, ListOrdered, Megaphone, Headphones,
  Award, Monitor, UserCog, Settings, FileText, BarChart3, Link as LinkIcon,
  LayoutDashboard, ArrowRight, Command, Zap, Shield, Download, Bell, Eye
} from 'lucide-react';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
  category: 'navigation' | 'action' | 'founder';
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'search' | 'commands'>('commands');
  const inputRef = useRef<HTMLInputElement>(null);

  const navigationActions: CommandAction[] = [
    { id: 'nav-executive', label: 'Executive Command Center', icon: <LayoutDashboard className="h-4 w-4" />, action: () => navigate('/executive'), category: 'navigation' },
    { id: 'nav-users', label: 'User Intelligence', icon: <Users className="h-4 w-4" />, action: () => navigate('/users'), category: 'navigation' },
    { id: 'nav-challenges', label: 'Challenge Operations', icon: <Trophy className="h-4 w-4" />, action: () => navigate('/challenges'), category: 'navigation' },
    { id: 'nav-funded', label: 'Funded Traders', icon: <TrendingUp className="h-4 w-4" />, action: () => navigate('/funded'), category: 'navigation' },
    { id: 'nav-payouts', label: 'Payout Operations', icon: <Wallet className="h-4 w-4" />, action: () => navigate('/payouts'), category: 'navigation' },
    { id: 'nav-kyc', label: 'KYC Verification', icon: <ShieldCheck className="h-4 w-4" />, action: () => navigate('/kyc'), category: 'navigation' },
    { id: 'nav-risk', label: 'Risk Management', icon: <AlertTriangle className="h-4 w-4" />, action: () => navigate('/risk'), category: 'navigation' },
    { id: 'nav-trades', label: 'Trade Surveillance', icon: <Activity className="h-4 w-4" />, action: () => navigate('/trades'), category: 'navigation' },
    { id: 'nav-orders', label: 'Order Monitoring', icon: <ListOrdered className="h-4 w-4" />, action: () => navigate('/orders'), category: 'navigation' },
    { id: 'nav-affiliates', label: 'Affiliate Operations', icon: <LinkIcon className="h-4 w-4" />, action: () => navigate('/affiliates'), category: 'navigation' },
    { id: 'nav-revenue', label: 'Revenue Intelligence', icon: <BarChart3 className="h-4 w-4" />, action: () => navigate('/revenue'), category: 'navigation' },
    { id: 'nav-support', label: 'Support Operations', icon: <Headphones className="h-4 w-4" />, action: () => navigate('/support'), category: 'navigation' },
    { id: 'nav-marketing', label: 'Marketing Operations', icon: <Megaphone className="h-4 w-4" />, action: () => navigate('/marketing'), category: 'navigation' },
    { id: 'nav-certificates', label: 'Certificate Center', icon: <Award className="h-4 w-4" />, action: () => navigate('/certificates'), category: 'navigation' },
    { id: 'nav-monitoring', label: 'System Monitoring', icon: <Monitor className="h-4 w-4" />, action: () => navigate('/monitoring'), category: 'navigation' },
    { id: 'nav-audit', label: 'Audit & Compliance', icon: <FileText className="h-4 w-4" />, action: () => navigate('/audit'), category: 'navigation' },
    { id: 'nav-staff', label: 'Staff Management', icon: <UserCog className="h-4 w-4" />, action: () => navigate('/staff'), category: 'navigation' },
    { id: 'nav-settings', label: 'Configuration', icon: <Settings className="h-4 w-4" />, action: () => navigate('/settings'), category: 'navigation' },
  ];

  const founderActions: CommandAction[] = [
    { id: 'founder-impersonate', label: 'Impersonate Staff Member', shortcut: '⌘I', icon: <Eye className="h-4 w-4" />, action: () => navigate('/founder/impersonate'), category: 'founder' },
    { id: 'founder-emergency', label: 'Emergency Controls', shortcut: '⌘E', icon: <Shield className="h-4 w-4" />, action: () => navigate('/founder/emergency'), category: 'founder' },
    { id: 'founder-export', label: 'Data Export Center', shortcut: '⌘D', icon: <Download className="h-4 w-4" />, action: () => navigate('/founder/exports'), category: 'founder' },
    { id: 'founder-activity', label: 'Staff Activity Feed', icon: <Zap className="h-4 w-4" />, action: () => navigate('/founder/activity'), category: 'founder' },
    { id: 'founder-flags', label: 'Feature Flags', icon: <Command className="h-4 w-4" />, action: () => navigate('/founder/flags'), category: 'founder' },
    { id: 'founder-notifications', label: 'Notification Center', shortcut: '⌘N', icon: <Bell className="h-4 w-4" />, action: () => navigate('/founder/notifications'), category: 'founder' },
  ];

  const allActions = [...founderActions, ...navigationActions];

  const filteredActions = query.length > 0
    ? allActions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : allActions;

  function navigate(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setMode('commands');
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Keyboard navigation
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredActions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        filteredActions[selectedIndex].action();
      }
    }
  }

  // Search when query looks like it's searching entities
  useEffect(() => {
    if (query.length < 2) { setResults({}); return; }
    if (query.startsWith('>') || query.startsWith('/')) return; // command mode

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || {});
          if (Object.keys(data.results || {}).length > 0) setMode('search');
        }
      } catch {} finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (!open) return null;

  const hasSearchResults = Object.keys(results).length > 0 && mode === 'search';

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Command palette">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-2xl">
        <div className="bg-background rounded-xl shadow-2xl border overflow-hidden">
          {/* Input */}
          <div className="flex items-center px-4 border-b h-14">
            <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-3" />
            <input
              ref={inputRef}
              placeholder="Search or jump to..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); setMode('commands'); }}
              onKeyDown={handleInputKeyDown}
              className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto">
            {/* Search Results */}
            {hasSearchResults && (
              <div className="p-2">
                {Object.entries(results).map(([type, items]) => (
                  <div key={type} className="mb-3">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{type}</div>
                    {items.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.href)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        </div>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Command Actions */}
            {!hasSearchResults && (
              <div className="p-2">
                {query.length === 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Founder Actions</div>
                )}
                {filteredActions.filter(a => a.category === 'founder').map((action, idx) => (
                  <button
                    key={action.id}
                    onClick={action.action}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors text-left ${selectedIndex === idx ? 'bg-accent' : 'hover:bg-accent/50'}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="text-muted-foreground">{action.icon}</span>
                    <span className="flex-1 font-medium">{action.label}</span>
                    {action.shortcut && <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{action.shortcut}</kbd>}
                  </button>
                ))}

                {query.length === 0 && (
                  <div className="px-2 py-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Navigation</div>
                )}
                {filteredActions.filter(a => a.category === 'navigation').map((action, idx) => {
                  const globalIdx = idx + filteredActions.filter(a => a.category === 'founder').length;
                  return (
                    <button
                      key={action.id}
                      onClick={action.action}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left ${selectedIndex === globalIdx ? 'bg-accent' : 'hover:bg-accent/50'}`}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <span className="text-muted-foreground">{action.icon}</span>
                      <span className="flex-1">{action.label}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </button>
                  );
                })}

                {filteredActions.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No results for &quot;{query}&quot;
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground bg-muted/30">
            <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">↵</kbd> select</span>
            <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">esc</kbd> close</span>
            <span className="ml-auto">Type to search users, accounts, tickets...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
