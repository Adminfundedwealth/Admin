'use client';
import { apiFetch } from '@/lib/api/fetch';
import { useState, useEffect } from 'react';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { SlidePanel } from '@/components/shared/slide-panel';
import { Shield, Edit2, CheckCircle, XCircle, Eye, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskRule {
  id: string;
  trading_account_id: string;
  rule_type: string;
  value: Record<string, unknown>;
  is_active: boolean;
  updated_at: string;
}

interface AccountRuleSet {
  accountId: string;
  accountCode: string;
  planType: string;
  status: string;
  rules: RiskRule[];
}

// Rules that are actively enforced by the risk engine at trade time
const ENFORCED_RULES = new Set([
  'daily_loss_limit', 'max_drawdown', 'trading_hours', 'no_overnight',
  'max_positions', 'max_lot_size', 'max_position_size', 'allowed_segments',
  'daily_profit_cap', 'risk_per_trade_idea', 'news_blackout', 'leverage_limit',
]);

// Rules that are display/payout-only (not enforced pre-trade)
const DISPLAY_ONLY_RULES = new Set([
  'profit_target', 'min_trading_days', 'consistency_rule', 'profit_split',
  'payout_threshold', 'scaling', 'inactivity_close', 'drawdown_type',
  'max_calendar_days', 'max_daily_trades', 'max_risk_per_trade',
]);

const PLAN_ICON: Record<string, React.ReactNode> = {
  flash:   <Zap size={12} className="text-amber-400" />,
  instant: <TrendingUp size={12} className="text-cyan-400" />,
  '1step': <Shield size={12} className="text-blue-400" />,
  '2step': <Shield size={12} className="text-purple-400" />,
};

const PLAN_LABELS: Record<string, string> = {
  flash: 'Flash',
  instant: 'Instant',
  '1step': '1-Step',
  '2step': '2-Step',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RiskRulesPage() {
  const [accounts, setAccounts] = useState<AccountRuleSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountRuleSet | null>(null);
  const [editRule, setEditRule] = useState<RiskRule | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { fetchAccounts(); }, []);

  async function fetchAccounts() {
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/risk/rules');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setAccounts(json.data || []);
    } catch {
      setError('Failed to load risk rules.');
    } finally {
      setLoading(false);
    }
  }

  async function saveRule() {
    if (!editRule || !editAccount) return;
    setSaving(true); setSaveError('');
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(editValue); }
      catch { setSaveError('Invalid JSON'); setSaving(false); return; }

      const res = await apiFetch(`/api/risk/rules/${editRule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: parsed }),
      });
      if (!res.ok) throw new Error('Save failed');
      await fetchAccounts();
      setPanelOpen(false);
    } catch (e: any) {
      setSaveError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(ruleId: string, currentActive: boolean) {
    await apiFetch(`/api/risk/rules/${ruleId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    fetchAccounts();
  }

  const filtered = accounts.filter(a => {
    const matchSearch = !search || a.accountCode.toLowerCase().includes(search.toLowerCase()) || a.accountId.includes(search);
    const matchPlan = !planFilter || a.planType === planFilter;
    return matchSearch && matchPlan;
  });

  if (error) return <ErrorState message={error} onRetry={fetchAccounts} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Shield size={18} /> Risk Rules Editor
          </h1>
          <p className="text-[11px] text-muted-foreground">
            View and edit per-account risk_rules without a deploy. Enforced rules take effect immediately.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
        <span className="flex items-center gap-1"><CheckCircle size={12} className="text-emerald-500" /> Enforced pre-trade (risk engine)</span>
        <span className="flex items-center gap-1"><Eye size={12} className="text-blue-400" /> Display / payout only</span>
        <span className="flex items-center gap-1"><XCircle size={12} className="text-red-400" /> Inactive (disabled)</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <input
          type="text" placeholder="Search account code or ID…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 h-8 px-3 rounded-md border bg-background text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="h-8 px-2 rounded-md border bg-background text-[12px] focus:outline-none">
          <option value="">All plans</option>
          <option value="flash">Flash</option>
          <option value="instant">Instant</option>
          <option value="1step">1-Step</option>
          <option value="2step">2-Step</option>
        </select>
      </div>

      {loading ? <LoadingState rows={6} /> : filtered.length === 0 ? <EmptyState message="No accounts match." /> : (
        <div className="space-y-3">
          {filtered.map(account => (
            <div key={account.accountId} className="rounded-md border overflow-hidden">
              {/* Account header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                <div className="flex items-center gap-2">
                  {PLAN_ICON[account.planType] ?? <Shield size={12} />}
                  <span className="font-mono text-[12px] font-semibold">{account.accountCode}</span>
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{PLAN_LABELS[account.planType] ?? account.planType}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize',
                    account.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                  )}>{account.status}</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{account.accountId.slice(0, 8)}…</span>
              </div>

              {/* Rules grid */}
              <div className="divide-y">
                {account.rules.map(rule => {
                  const isEnforced = ENFORCED_RULES.has(rule.rule_type);
                  const isDisplayOnly = DISPLAY_ONLY_RULES.has(rule.rule_type);
                  return (
                    <div key={rule.id} className="grid grid-cols-[200px_1fr_100px_80px] items-center px-4 py-2 hover:bg-muted/10 text-[12px]">
                      <div className="flex items-center gap-1.5">
                        {!rule.is_active
                          ? <XCircle size={11} className="text-red-400 shrink-0" />
                          : isEnforced
                          ? <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                          : <Eye size={11} className="text-blue-400 shrink-0" />
                        }
                        <span className={cn('font-mono text-[11px]', !rule.is_active && 'line-through text-muted-foreground')}>
                          {rule.rule_type}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[400px]">
                        {JSON.stringify(rule.value)}
                      </span>
                      <span className={cn('text-[10px] text-center',
                        isEnforced ? 'text-emerald-500' : isDisplayOnly ? 'text-blue-400' : 'text-muted-foreground'
                      )}>
                        {isEnforced ? 'enforced' : isDisplayOnly ? 'display' : 'unknown'}
                      </span>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => toggleRule(rule.id, rule.is_active)}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                            rule.is_active
                              ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                              : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                          )}
                        >{rule.is_active ? 'Disable' : 'Enable'}</button>
                        <button
                          onClick={() => {
                            setEditAccount(account);
                            setEditRule(rule);
                            setEditValue(JSON.stringify(rule.value, null, 2));
                            setSaveError('');
                            setPanelOpen(true);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
                        ><Edit2 size={10} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setSaveError(''); }}
        title="Edit Rule"
        subtitle={editRule?.rule_type}
      >
        {editRule && editAccount && (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Account</p>
              <p className="font-mono text-[12px]">{editAccount.accountCode}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Rule type</p>
              <p className="font-mono text-[12px] flex items-center gap-1.5">
                {ENFORCED_RULES.has(editRule.rule_type)
                  ? <><CheckCircle size={11} className="text-emerald-500" /> enforced pre-trade</>
                  : <><Eye size={11} className="text-blue-400" /> display / payout only</>
                }
              </p>
            </div>
            {ENFORCED_RULES.has(editRule.rule_type) && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300">
                ⚠ This rule is enforced at trade time. Changes take effect on the next order placed.
              </div>
            )}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">Value (JSON)</p>
              <textarea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={10}
                className="w-full font-mono text-[11px] p-3 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            {saveError && (
              <p className="text-[11px] text-red-400">{saveError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveRule}
                disabled={saving}
                className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >{saving ? 'Saving…' : 'Save changes'}</button>
              <button
                onClick={() => { setPanelOpen(false); setSaveError(''); }}
                className="h-8 px-4 rounded-md border text-[12px] hover:bg-muted transition-colors"
              >Cancel</button>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
