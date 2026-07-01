'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { ToggleLeft, ToggleRight, Plus } from 'lucide-react';

/**
 * Feature Flags — persisted to feature_flags table.
 * Reads: feature_flags (via /api/founder/flags)
 * Writes: feature_flags, audit_records (via /api/founder/flags POST/PATCH)
 */

interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const scopeColors: Record<string, string> = {
  global: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  staff: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  traders: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newScope, setNewScope] = useState('global');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchFlags();
  }, []);

  async function fetchFlags() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/founder/flags');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setFlags(json.data || []);
    } catch {
      setError('Failed to load feature flags.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleFlag(id: string, currentEnabled: boolean) {
    setToggling(id);
    try {
      const res = await apiFetch('/api/founder/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !currentEnabled }),
      });
      if (res.ok) {
        setFlags(prev => prev.map(f => f.id === id ? { ...f, enabled: !currentEnabled } : f));
      }
    } catch {
      fetchFlags();
    } finally {
      setToggling(null);
    }
  }

  async function createFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/founder/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null, scope: newScope, enabled: false }),
      });
      if (res.ok) {
        setNewName('');
        setNewDesc('');
        setShowCreate(false);
        fetchFlags();
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={fetchFlags} />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground">Control feature rollouts without code deployments</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3.5 w-3.5" /> New Flag
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={createFlag} className="space-y-3">
              <Input placeholder="Flag name" value={newName} onChange={e => setNewName(e.target.value)} required />
              <Input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              <select value={newScope} onChange={e => setNewScope(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm w-full">
                <option value="global">Global</option>
                <option value="staff">Staff Only</option>
                <option value="traders">Traders Only</option>
              </select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={creating || !newName.trim()}>
                  {creating ? 'Creating...' : 'Create Flag'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <LoadingState rows={6} />
      ) : flags.length === 0 ? (
        <EmptyState message="No feature flags configured yet." />
      ) : (
        <div className="space-y-2">
          {flags.map((flag) => (
            <Card key={flag.id} className={flag.enabled ? 'border-primary/20' : 'opacity-75'}>
              <CardContent className="p-4 flex items-center gap-4">
                <button
                  onClick={() => toggleFlag(flag.id, flag.enabled)}
                  disabled={toggling === flag.id}
                  className="shrink-0"
                >
                  {flag.enabled
                    ? <ToggleRight className="h-7 w-7 text-primary" />
                    : <ToggleLeft className="h-7 w-7 text-muted-foreground" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{flag.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${scopeColors[flag.scope] || scopeColors.global}`}>{flag.scope}</span>
                  </div>
                  {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
                </div>
                <span className={`text-xs font-medium ${flag.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {flag.enabled ? 'ON' : 'OFF'}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
