'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleLeft, ToggleRight } from 'lucide-react';

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: 'global' | 'staff' | 'traders';
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([
    { id: 'new_dashboard', name: 'New Executive Dashboard', description: 'Redesigned KPI layout with real-time charts', enabled: true, scope: 'staff' },
    { id: 'auto_kyc', name: 'Automated KYC Verification', description: 'AI-powered document verification for basic submissions', enabled: false, scope: 'global' },
    { id: 'instant_payouts', name: 'Instant Payouts', description: 'Skip manual approval for payouts under $500', enabled: false, scope: 'global' },
    { id: 'beta_risk_engine', name: 'Beta Risk Engine v2', description: 'New anomaly detection algorithm with ML-based scoring', enabled: false, scope: 'global' },
    { id: 'multi_currency', name: 'Multi-Currency Support', description: 'Allow challenges and payouts in EUR, GBP, AUD', enabled: false, scope: 'traders' },
    { id: 'affiliate_v2', name: 'Affiliate Dashboard v2', description: 'New affiliate portal with real-time commission tracking', enabled: true, scope: 'traders' },
    { id: 'dark_mode_traders', name: 'Dark Mode (Trader Portal)', description: 'Enable dark mode toggle on the public trading platform', enabled: true, scope: 'traders' },
  ]);

  function toggleFlag(id: string) {
    setFlags(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  }

  const scopeColors: Record<string, string> = {
    global: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    staff: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    traders: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
        <p className="text-muted-foreground">Control feature rollouts without code deployments</p>
      </div>

      <div className="space-y-2">
        {flags.map((flag) => (
          <Card key={flag.id} className={flag.enabled ? 'border-primary/20' : 'opacity-75'}>
            <CardContent className="p-4 flex items-center gap-4">
              <button onClick={() => toggleFlag(flag.id)} className="shrink-0">
                {flag.enabled
                  ? <ToggleRight className="h-7 w-7 text-primary" />
                  : <ToggleLeft className="h-7 w-7 text-muted-foreground" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{flag.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${scopeColors[flag.scope]}`}>{flag.scope}</span>
                </div>
                <p className="text-xs text-muted-foreground">{flag.description}</p>
              </div>
              <span className={`text-xs font-medium ${flag.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                {flag.enabled ? 'ON' : 'OFF'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
