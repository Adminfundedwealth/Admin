'use client';

import { apiFetch } from '@/lib/api/fetch';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { Save, RefreshCw, Tag, ToggleLeft, ToggleRight } from 'lucide-react';

interface DiscountRow {
  id: string;
  plan_type: string;
  code: string;
  discount_pct: number;
  active: boolean;
  updated_at: string;
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  flash:   { label: 'Flash Funding',      color: 'text-yellow-400' },
  instant: { label: 'Instant Funding',    color: 'text-pink-400'   },
  '1step': { label: '1-Step Evaluation',  color: 'text-purple-400' },
  '2step': { label: '2-Step Evaluation',  color: 'text-emerald-400'},
};

export default function DiscountConfigPage() {
  const [rows, setRows]       = useState<DiscountRow[]>([]);
  const [edits, setEdits]     = useState<Record<string, { code: string; discountPct: number; active: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  async function fetchConfig() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/founder/discount-config');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      const data: DiscountRow[] = json.data || [];
      setRows(data);
      // Initialise edit state from DB values
      const init: typeof edits = {};
      for (const row of data) {
        init[row.plan_type] = { code: row.code, discountPct: row.discount_pct, active: row.active };
      }
      setEdits(init);
    } catch {
      setError('Failed to load discount config.');
    } finally {
      setLoading(false);
    }
  }

  function setField(planType: string, field: 'code' | 'discountPct' | 'active', value: string | number | boolean) {
    setEdits(prev => ({
      ...prev,
      [planType]: { ...prev[planType], [field]: value },
    }));
  }

  /** Apply the same code to ALL plans at once */
  function applyCodeToAll(code: string) {
    setEdits(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], code };
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updates = Object.entries(edits).map(([planType, vals]) => ({
        planType,
        code: vals.code.toUpperCase(),
        discountPct: vals.discountPct,
        active: vals.active,
      }));

      const res = await apiFetch('/api/founder/discount-config', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Save failed');
      }

      setSaved(true);
      fetchConfig();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState rows={4} />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={fetchConfig} />;

  // Determine if any bulk-code apply is possible
  const firstCode = edits[Object.keys(edits)[0]]?.code ?? '';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="h-7 w-7 text-primary" />
            Discount Code Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Change the active promo code for each plan. The main site updates within 60 seconds.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchConfig} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Bulk apply */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply one code to all plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center">
            <Input
              className="font-mono max-w-xs uppercase"
              placeholder="e.g. INDIA80"
              value={firstCode}
              onChange={e => applyCodeToAll(e.target.value.toUpperCase())}
            />
            <Button variant="secondary" onClick={() => applyCodeToAll(firstCode)}>
              Apply to all
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-plan rows */}
      <div className="grid gap-4">
        {rows.map(row => {
          const edit = edits[row.plan_type] ?? { code: row.code, discountPct: row.discount_pct, active: row.active };
          const meta = PLAN_LABELS[row.plan_type] ?? { label: row.plan_type, color: 'text-white' };
          return (
            <Card key={row.plan_type}>
              <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Plan label */}
                <div className="w-44 shrink-0">
                  <div className={`font-bold text-lg ${meta.color}`}>{meta.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{row.plan_type}</div>
                </div>

                {/* Code input */}
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-muted-foreground">Promo Code</label>
                  <Input
                    className="font-mono uppercase"
                    value={edit.code}
                    maxLength={30}
                    onChange={e => setField(row.plan_type, 'code', e.target.value.toUpperCase())}
                  />
                </div>

                {/* Discount % */}
                <div className="flex flex-col gap-1 w-28 shrink-0">
                  <label className="text-xs text-muted-foreground">Discount %</label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={edit.discountPct}
                    onChange={e => setField(row.plan_type, 'discountPct', Number(e.target.value))}
                  />
                </div>

                {/* Active toggle */}
                <div className="flex flex-col gap-1 items-center shrink-0">
                  <label className="text-xs text-muted-foreground">Active</label>
                  <button
                    onClick={() => setField(row.plan_type, 'active', !edit.active)}
                    className="mt-1"
                    title={edit.active ? 'Disable' : 'Enable'}
                  >
                    {edit.active
                      ? <ToggleRight className="h-7 w-7 text-green-500" />
                      : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-32">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        {saved && <span className="text-green-500 text-sm font-medium">✓ Saved! Site updates in ~60s.</span>}
        {error && <span className="text-red-500 text-sm">{error}</span>}
      </div>

      {/* Last updated info */}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Last saved: {new Date(rows[0].updated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
