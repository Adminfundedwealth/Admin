'use client';
import { BarChart2, AlertTriangle } from 'lucide-react';
import { RiskRulesProfileEditor } from '@/components/risk-rules/profile-editor';
import { ONESTEP_FIELDS } from '@/components/risk-rules/field-defs';

export default function OneStepRulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <BarChart2 size={16} className="text-blue-400" /> 1-Step — Risk Profile
        </h1>
        <p className="text-[11px] text-muted-foreground">
          Evaluation + Funded phases. 10% target in eval, 80%→90% split in funded.
        </p>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-300">
        <AlertTriangle size={11} /> Migration 023 required for live DB reads. Falls back to hardcoded defaults until applied.
      </div>
      <RiskRulesProfileEditor plan="onestep" label="1-Step" fields={ONESTEP_FIELDS} hasPhases={true} />
    </div>
  );
}