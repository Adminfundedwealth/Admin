'use client';

/**
 * RiskRulesProfileEditor
 *
 * Generic editable profile panel for a single plan/phase combination.
 * Used by Flash, Instant, 1-Step (Eval/Funded), and 2-Step (P1/P2/Funded) pages.
 *
 * Data flow:
 *   GET /api/risk-rules/[plan]       → load current profile
 *   PUT /api/risk-rules/[plan]       → save changed fields only
 *   GET /api/risk-rules/[plan]/audit → load audit history
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { cn } from '@/lib/utils';
import { Save, RefreshCw, History, ChevronDown, ChevronUp, CheckCircle, AlertTriangle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type FieldType = 'number' | 'boolean' | 'time' | 'segments';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  description?: string;
  phase?: string;
}

interface AuditEntry {
  rule_name: string;
  phase?: string;
  old_value: { value: unknown } | null;
  new_value: { value: unknown };
  changed_by: string;
  changed_at: string;
}

// ─── Field input ─────────────────────────────────────────────────────────────

function FieldInput({ field, value, onChange }: {
  field: FieldDef;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <button
        onClick={() => onChange(field.key, !value)}
        className={cn(
          'px-2.5 py-1 text-[12px] font-bold rounded border transition-colors',
          value ? 'bg-emerald-500/15 border-emerald-600/40 text-emerald-400'
                : 'bg-red-500/15 border-red-600/40 text-red-400'
        )}
      >
        {value ? 'YES' : 'NO'}
      </button>
    );
  }

  if (field.type === 'segments') {
    const arr: string[] = Array.isArray(value) ? value as string[] : [];
    const ALL = ['NSE', 'NFO', 'BFO', 'MCX', 'CDS', 'BSE'];
    return (
      <div className="flex flex-wrap gap-1">
        {ALL.map(seg => (
          <button
            key={seg}
            onClick={() => {
              const next = arr.includes(seg) ? arr.filter(s => s !== seg) : [...arr, seg];
              onChange(field.key, next);
            }}
            className={cn(
              'px-1.5 py-0.5 text-[11px] font-bold rounded border transition-colors',
              arr.includes(seg)
                ? 'bg-primary/20 border-primary/50 text-primary'
                : 'bg-muted border-border text-muted-foreground'
            )}
          >
            {seg}
          </button>
        ))}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value !== null && value !== undefined ? String(value) : ''}
      onChange={e => {
        const raw = e.target.value;
        onChange(field.key, field.type === 'number' ? (raw === '' ? '' : parseFloat(raw)) : raw);
      }}
      className="bg-background border border-border rounded px-2 py-1 text-[12px] font-mono w-24 text-right focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

// ─── Phase group ─────────────────────────────────────────────────────────────

function PhaseGroup({ phase, fields, profile, draft, dirtyKeys, onChange }: {
  phase: string;
  fields: FieldDef[];
  profile: Record<string, unknown>;
  draft: Record<string, unknown>;
  dirtyKeys: Set<string>;
  onChange: (key: string, val: unknown) => void;
}) {
  const [open, setOpen] = useState(true);
  const dirtyCount = fields.filter(f => dirtyKeys.has(f.key)).length;

  const phaseColor: Record<string, string> = {
    'Evaluation': 'text-blue-400 border-blue-800/40',
    'Phase 1':    'text-blue-400 border-blue-800/40',
    'Phase 2':    'text-purple-400 border-purple-800/40',
    'Funded':     'text-emerald-400 border-emerald-800/40',
    'Shared':     'text-muted-foreground border-border',
  };

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left',
          'bg-muted/30 hover:bg-muted/50 transition-colors text-[12px] font-bold uppercase tracking-wide',
          phaseColor[phase] ?? 'text-muted-foreground border-border'
        )}
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {phase}
        {dirtyCount > 0 && (
          <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
            {dirtyCount} unsaved
          </span>
        )}
      </button>
      {open && (
        <table className="w-full mt-1 text-[12px]">
          <thead>
            <tr className="text-muted-foreground text-[10px]">
              <th className="text-left font-medium py-1 pr-2 w-[42%]">Rule</th>
              <th className="text-right font-medium py-1 pr-2 w-[22%]">Current</th>
              <th className="text-right font-medium py-1 w-[32%]">Edit</th>
              <th className="w-4" />
            </tr>
          </thead>
          <tbody>
            {fields.map(f => {
              const isDirty = dirtyKeys.has(f.key);
              return (
                <tr key={f.key} className={cn('group', isDirty && 'bg-amber-500/5')}>
                  <td className="py-1 pr-2">
                    <div className="font-medium text-foreground">{f.label}</div>
                    {f.description && <div className="text-[10px] text-muted-foreground">{f.description}</div>}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <span className={cn('font-mono text-[11px]', isDirty ? 'line-through text-muted-foreground/50' : 'text-muted-foreground')}>
                      {Array.isArray(profile[f.key]) ? (profile[f.key] as string[]).join(', ') : String(profile[f.key] ?? '—')}
                      {f.unit && !Array.isArray(profile[f.key]) && <span className="text-muted-foreground/60 ml-0.5">{f.unit}</span>}
                    </span>
                  </td>
                  <td className="py-1 text-right">
                    <FieldInput field={f} value={draft[f.key]} onChange={onChange} />
                    {f.unit && f.type !== 'boolean' && f.type !== 'segments' && (
                      <span className="text-[10px] text-muted-foreground ml-1">{f.unit}</span>
                    )}
                  </td>
                  <td className="py-1 pl-1 w-4">
                    {isDirty && <span className="text-amber-400 text-[14px]">●</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLog({ entries, loading }: { entries: AuditEntry[]; loading: boolean }) {
  if (loading) return <div className="text-[12px] text-muted-foreground py-3 text-center">Loading…</div>;
  if (!entries.length) return <div className="text-[12px] text-muted-foreground italic py-3 text-center">No changes recorded yet.</div>;
  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {entries.map((e, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px] bg-muted/20 border border-border/30 rounded px-2.5 py-1.5">
          <div className="flex-1 min-w-0">
            <span className="font-mono font-semibold text-foreground">{e.rule_name}</span>
            {e.phase && <span className="ml-1 text-[9px] text-muted-foreground uppercase">[{e.phase}]</span>}
            <span className="text-muted-foreground ml-1.5">
              {e.old_value != null ? String(e.old_value?.value ?? e.old_value) : '—'} →{' '}
            </span>
            <span className="text-primary font-semibold">{String(e.new_value?.value ?? e.new_value)}</span>
          </div>
          <div className="text-right text-muted-foreground flex-shrink-0 text-[10px]">
            <div className="font-mono">{String(e.changed_by).slice(0, 10)}</div>
            <div>{e.changed_at ? new Date(e.changed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RiskRulesProfileEditorProps {
  plan: string;
  label: string;
  fields: FieldDef[];
  hasPhases: boolean;
}

export function RiskRulesProfileEditor({ plan, label, fields, hasPhases }: RiskRulesProfileEditorProps) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`/api/risk-rules/${plan}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setProfile(j.profile);
      setDraft({ ...j.profile });
    } catch (e: any) {
      setError(e.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [plan]);

  useEffect(() => { load(); }, [load]);

  const dirtyKeys = new Set<string>(
    profile
      ? fields.filter(f => JSON.stringify(draft[f.key]) !== JSON.stringify(profile[f.key])).map(f => f.key)
      : []
  );

  const handleChange = (key: string, val: unknown) => {
    setDraft(d => ({ ...d, [key]: val }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (dirtyKeys.size === 0) return;
    setSaving(true); setSaveError(''); setSaveSuccess(false);
    try {
      const updates: Record<string, unknown> = {};
      Array.from(dirtyKeys).forEach(key => { updates[key] = draft[key]; });

      const res = await apiFetch(`/api/risk-rules/${plan}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      const j = await res.json();
      if (!res.ok) {
        const msg = j.errors?.join(', ') || j.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setProfile(j.profile);
      setDraft({ ...j.profile });
      setSaveSuccess(true);
      // Reload audit if open
      if (showAudit) loadAudit();
    } catch (e: any) {
      setSaveError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (profile) { setDraft({ ...profile }); setSaveError(''); setSaveSuccess(false); }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await apiFetch(`/api/risk-rules/${plan}/audit?limit=50`);
      if (res.ok) { const j = await res.json(); setAuditEntries(j.audit || []); }
    } catch {}
    setAuditLoading(false);
  };

  const handleToggleAudit = () => {
    if (!showAudit) loadAudit();
    setShowAudit(v => !v);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground text-[13px]">Loading {label} profile…</div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <p className="text-red-400 text-[13px]">{error}</p>
        <button onClick={load} className="px-3 py-1.5 text-[12px] rounded border border-border hover:bg-muted transition-colors">Retry</button>
      </div>
    );
  }

  const phases = hasPhases ? Array.from(new Set(fields.map(f => f.phase != null ? f.phase : 'Shared'))) : ['all'];

  return (
    <div className="flex flex-col gap-3">
      {/* Action bar */}
      <div className="flex items-center gap-2 sticky top-0 z-10 bg-background py-2 border-b border-border/40">
        <span className="text-[12px]">
          {dirtyKeys.size > 0
            ? <span className="text-amber-400 font-bold">{dirtyKeys.size} unsaved change{dirtyKeys.size !== 1 ? 's' : ''}</span>
            : saveSuccess
              ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>
              : <span className="text-muted-foreground">All saved</span>
          }
        </span>
        <div className="flex-1" />
        <button
          onClick={load}
          className="flex items-center gap-1 px-2.5 py-1 text-[12px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw size={11} /> Reload
        </button>
        <button
          onClick={handleToggleAudit}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 text-[12px] rounded border transition-colors',
            showAudit ? 'bg-blue-500/10 border-blue-700/40 text-blue-400' : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          <History size={11} /> {showAudit ? 'Hide Log' : 'Audit Log'}
        </button>
        <button
          onClick={handleReset}
          disabled={dirtyKeys.size === 0}
          className="flex items-center gap-1 px-2.5 py-1 text-[12px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || dirtyKeys.size === 0}
          className={cn(
            'flex items-center gap-1 px-3 py-1 text-[12px] font-bold rounded border transition-colors',
            dirtyKeys.size > 0
              ? 'bg-primary/15 border-primary/50 text-primary hover:bg-primary/25'
              : 'border-border text-muted-foreground opacity-30 cursor-not-allowed'
          )}
        >
          <Save size={11} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[12px]">
          <AlertTriangle size={12} /> {saveError}
        </div>
      )}

      {/* Audit log */}
      {showAudit && (
        <div className="border border-border/40 rounded-md p-2.5 bg-muted/10">
          <div className="text-[11px] font-bold text-muted-foreground uppercase mb-2">Change History</div>
          <AuditLog entries={auditEntries} loading={auditLoading} />
        </div>
      )}

      {/* Fields */}
      {hasPhases ? (
        phases.map(phase => (
          <PhaseGroup
            key={phase}
            phase={phase}
            fields={fields.filter(f => (f.phase ?? 'Shared') === phase)}
            profile={profile!}
            draft={draft}
            dirtyKeys={dirtyKeys}
            onChange={handleChange}
          />
        ))
      ) : (
        <PhaseGroup
          phase="all"
          fields={fields}
          profile={profile!}
          draft={draft}
          dirtyKeys={dirtyKeys}
          onChange={handleChange}
        />
      )}
    </div>
  );
}
