'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { cn } from '@/lib/utils';
import { Zap, TrendingUp, BarChart2, Layers, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface PlanSummary { label: string; href: string; plan: string; icon: React.ReactNode; color: string; keyField: string; keyLabel: string; }
const PLANS: PlanSummary[] = [
  { label: 'Flash',   href: '/risk-rules/flash',   plan: 'flash',   icon: <Zap size={14}/>,        color: 'text-amber-400',   keyField: 'per_position_loss_pct', keyLabel: 'Per-Position Loss' },
  { label: 'Instant', href: '/risk-rules/instant', plan: 'instant', icon: <TrendingUp size={14}/>,  color: 'text-cyan-400',    keyField: 'daily_loss_pct',        keyLabel: 'Daily Loss' },
  { label: '1-Step',  href: '/risk-rules/onestep', plan: 'onestep', icon: <BarChart2 size={14}/>,   color: 'text-blue-400',    keyField: 'e_profit_target_pct',   keyLabel: 'Eval Target' },
  { label: '2-Step',  href: '/risk-rules/twostep', plan: 'twostep', icon: <Layers size={14}/>,      color: 'text-purple-400',  keyField: 'p1_profit_target_pct',  keyLabel: 'P1 Target' },
];

function PlanCard({ p }: { p: PlanSummary }) {
  const [profile, setProfile] = useState<Record<string,unknown>|null>(null);
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');
  useEffect(() => {
    apiFetch(`/api/risk-rules/${p.plan}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => { setProfile(j.profile); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, [p.plan]);
  const val = profile ? profile[p.keyField] : null;
  const updated = profile ? (profile.updated_at as string) : null;
  return (
    <Link href={p.href} className="block rounded-lg border border-border hover:border-border/80 bg-muted/10 hover:bg-muted/20 transition-all p-4 group">
      <div className="flex items-center gap-2 mb-3">
        <span className={p.color}>{p.icon}</span>
        <span className="text-[14px] font-bold text-foreground">{p.label}</span>
        {status === 'error' && <span className="ml-auto text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">UNAVAILABLE</span>}
        {status === 'loading' && <span className="ml-auto text-[10px] text-muted-foreground">Loading…</span>}
      </div>
      {status === 'ok' && profile && (
        <div className="space-y-1 text-[12px]">
          <div className="flex justify-between"><span className="text-muted-foreground">{p.keyLabel}</span><span className="font-mono font-semibold">{String(val ?? '—')}%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Max Drawdown</span><span className="font-mono">{String(profile.max_drawdown_pct ?? profile.p1_max_drawdown_pct ?? profile.e_max_drawdown_pct ?? '—')}%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Leverage</span><span className="font-mono">{String(profile.leverage_max ?? profile.p1_leverage_max ?? profile.e_leverage_max ?? '—')}x</span></div>
          {updated && <div className="text-[10px] text-muted-foreground/60 pt-1">Updated: {new Date(updated).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'short',timeStyle:'short'})}</div>}
        </div>
      )}
      {status === 'error' && <p className="text-[12px] text-muted-foreground">Could not load — table may be pending migration.</p>}
      <div className="mt-3 text-[11px] text-primary group-hover:underline">Edit rules →</div>
    </Link>
  );
}

export default function RiskRulesOverviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2"><AlertTriangle size={16} className="text-orange-400" /> Risk Rules Engine</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">Centralized rule profiles for Flash, Instant, 1-Step, and 2-Step accounts. Changes are live immediately — no deploy required.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PLANS.map(p => <PlanCard key={p.plan} p={p} />)}
      </div>
      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-300 space-y-1">
        <p className="font-bold">⚠ Migration status</p>
        <p>Flash (019): APPLIED ✓ — Instant (020), 2-Step (022), 1-Step (023): PENDING — pages will show errors until migrations are applied.</p>
      </div>
    </div>
  );
}