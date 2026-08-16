'use client';
import { Zap } from 'lucide-react';
import { RiskRulesProfileEditor } from '@/components/risk-rules/profile-editor';
import { FLASH_FIELDS } from '@/components/risk-rules/field-defs';

export default function FlashRulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Zap size={16} className="text-amber-400" /> Flash — Risk Profile
        </h1>
        <p className="text-[11px] text-muted-foreground">
          Single centralized profile. 24h challenge, per-position loss rule, 1:50 leverage.
          Changes take effect on the next order placed.
        </p>
      </div>
      <RiskRulesProfileEditor plan="flash" label="Flash" fields={FLASH_FIELDS} hasPhases={false} />
    </div>
  );
}