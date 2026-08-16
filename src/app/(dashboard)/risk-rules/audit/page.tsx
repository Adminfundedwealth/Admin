'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditEntry {
  plan: string;
  rule_name: string;
  phase?: string;
  old_value: { value: unknown } | null;
  new_value: { value: unknown };
  changed_by: string;
  changed_at: string;
}

const PLANS = ['flash', 'instant', 'onestep', 'twostep'] as const;
const PLAN_LABELS: Record<string, string> = { flash: 'Flash', instant: 'Instant', onestep: '1-Step', twostep: '2-Step' };
const PLAN_COLORS: Record<string, string> = {
  flash: 'bg-amber-500/10 text-amber-400',
  instant: 'bg-cyan-500/10 text-cyan-400',
  onestep: 'bg-blue-500/10 text-blue-400',
  twostep: 'bg-purple-500/10 text-purple-400',
};

export default function RiskRulesAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        PLANS.map(plan =>
          apiFetch(`/api/risk-rules/${plan}/audit?limit=50`)
            .then(r => r.ok ? r.json() : { audit: [] })
            .then(j => (j.audit || []).map((e: Omit<AuditEntry, 'plan'>) => ({ ...e, plan })))
        )
      );
      const all: AuditEntry[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value);
      }
      all.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
      setEntries(all);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = planFilter ? entries.filter(e => e.plan === planFilter) : entries;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <FileText size={16} className="text-muted-foreground" /> Audit History
          </h1>
          <p className="text-[11px] text-muted-foreground">All risk profile changes across Flash, Instant, 1-Step, 2-Step.</p>
        </div>
        <button onClick={load} className={cn('flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors', loading && 'opacity-50')}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Plan filter */}
      <div className="flex gap-1.5">
        {(['', ...PLANS] as const).map(p => (
          <button key={p} onClick={() => setPlanFilter(p)}
            className={cn('px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors',
              planFilter === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
            )}>
            {p ? PLAN_LABELS[p] : 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-[13px]">Loading audit logs…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-[13px]">No changes recorded yet.</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((e, i) => (
            <div key={i} className="flex items-start gap-3 text-[12px] bg-muted/10 border border-border/30 rounded-md px-3 py-2">
              <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 mt-0.5', PLAN_COLORS[e.plan])}>
                {PLAN_LABELS[e.plan] ?? e.plan}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-mono font-semibold text-foreground">{e.rule_name}</span>
                {e.phase && <span className="ml-1 text-[10px] text-muted-foreground">[{e.phase}]</span>}
                <span className="text-muted-foreground mx-1.5">
                  {e.old_value != null ? String(e.old_value?.value ?? e.old_value) : '—'} →
                </span>
                <span className="text-primary font-semibold">{String(e.new_value?.value ?? e.new_value)}</span>
              </div>
              <div className="text-right text-muted-foreground text-[10px] shrink-0">
                <div className="font-mono">{String(e.changed_by).slice(0, 12)}</div>
                <div>{new Date(e.changed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}