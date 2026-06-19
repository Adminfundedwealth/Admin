'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);

  // Listen for Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Search on query change (debounced)
  useEffect(() => {
    if (query.length < 2) {
      setResults({});
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || {});
        }
      } catch {
        // Silently fail search
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    setResults({});
    router.push(href);
  }, [router]);

  if (!open) return null;

  const hasResults = Object.keys(results).length > 0;
  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Global search">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-background rounded-lg shadow-2xl border overflow-hidden">
          {/* Search input */}
          <div className="flex items-center px-4 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              placeholder="Search users, accounts, tickets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
            />
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 p-1 rounded hover:bg-muted"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {loading && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Searching...
              </p>
            )}

            {!loading && query.length >= 2 && !hasResults && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No results found for &quot;{query}&quot;
              </p>
            )}

            {!loading && query.length < 2 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Type at least 2 characters to search
              </p>
            )}

            {hasResults && Object.entries(results).map(([type, items]) => (
              <div key={type} className="mb-2">
                <h3 className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                  {type} ({items.length})
                </h3>
                <ul>
                  {items.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => handleSelect(item.href)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
                      >
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                  {items.length > 5 && (
                    <li className="px-3 py-1">
                      <button
                        onClick={() => handleSelect(`/${type.toLowerCase()}?search=${encodeURIComponent(query)}`)}
                        className="text-xs text-primary hover:underline"
                      >
                        View all {items.length} results →
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
