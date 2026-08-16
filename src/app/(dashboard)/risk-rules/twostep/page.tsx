'use client';
import { Layers, AlertTriangle } from 'lucide-react';
import { RiskRulesProfileEditor } from '@/components/risk-rules/profile-editor';
import { TWOSTEP_FIELDS } from '@/components/risk-rules/field-defs';

export default function TwoStepRulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Layers size={16} className="text-purple-400" /> 2-Step — Risk Profile
        </h1>
        <p className="text-[11px] text-muted-foreground">
          Phase 1, Phase 2, and Funded. 80%→90% split after first approved payout.
        </p>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-300">
        <AlertTriangle size={11} /> Migration 022 required for live DB reads. Falls back to hardcoded defaults until applied.
      </div>
      <RiskRulesProfileEditor plan="twostep" label="2-Step" fields={TWOSTEP_FIELDS} hasPhases={true} />
    </div>
  );
}