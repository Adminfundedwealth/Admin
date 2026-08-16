'use client';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { RiskRulesProfileEditor } from '@/components/risk-rules/profile-editor';
import { INSTANT_FIELDS } from '@/components/risk-rules/field-defs';

export default function InstantRulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp size={16} className="text-cyan-400" /> Instant Funding — Risk Profile
        </h1>
        <p className="text-[11px] text-muted-foreground">
          No profit target. 3% daily DD, 5% max DD, 80% flat split.
          Changes take effect on the next order placed.
        </p>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-300">
        <AlertTriangle size={11} /> Migration 020 required for live DB reads. Falls back to hardcoded defaults until applied.
      </div>
      <RiskRulesProfileEditor plan="instant" label="Instant" fields={INSTANT_FIELDS} hasPhases={false} />
    </div>
  );
}