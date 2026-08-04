'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Trophy, TrendingUp, DollarSign, Wallet, ShieldCheck, Headphones, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { DrillDownModal, DrillDownType } from './drill-down-modal';

interface KPIData {
  activeUsers: number;
  activeChallenges: number;
  activeFunded: number;
  revenueToday: number;
  revenueYesterday: number;
  revenueDelta: number;
  pendingPayouts: number;
  pendingPayoutValue: number;
  pendingKYC: number;
  openTickets: number;
  riskAlerts: number;
  challengePassRate: number;
  challengeFailRate: number;
  staffOnline: number;
}

const defaultKPI: KPIData = {
  activeUsers: 0, activeChallenges: 0, activeFunded: 0,
  revenueToday: 0, revenueYesterday: 0, revenueDelta: 0,
  pendingPayouts: 0, pendingPayoutValue: 0, pendingKYC: 0,
  openTickets: 0, riskAlerts: 0,
  challengePassRate: 0, challengeFailRate: 0, staffOnline: 3,
};

function DeltaIndicator({ value }: { value: number }) {
  if (value === 0) return <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Minus className="h-2.5 w-2.5" />0%</span>;
  if (value > 0) return <span className="flex items-center gap-0.5 text-[10px] text-green-600"><ArrowUp className="h-2.5 w-2.5" />+{value.toFixed(1)}%</span>;
  return <span className="flex items-center gap-0.5 text-[10px] text-red-600"><ArrowDown className="h-2.5 w-2.5" />{value.toFixed(1)}%</span>;
}

export function KPICards() {
  const [data, setData] = useState<KPIData>(defaultKPI);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs();
    const interval = setInterval(fetchKPIs, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchKPIs() {
    try {
      const res = await fetch('/api/executive/metrics');
      if (res.ok) {
        const json = await res.json();
        setData({ ...defaultKPI, ...json.data });
      }
    } catch {} finally { setLoading(false); }
  }

  const [drillDown, setDrillDown] = useState<DrillDownType>(null);

  const cards: Array<{
    label: string;
    value: string;
    delta?: number;
    subtitle?: string;
    icon: React.ElementType;
    accent: string;
    drillDown?: DrillDownType;
    hint?: string;
  }> = [
    { label: 'Revenue Today', value: formatCurrency(data.revenueToday), delta: data.revenueDelta, icon: DollarSign, accent: 'text-green-600' },
    { label: 'Revenue Yesterday', value: formatCurrency(data.revenueYesterday), icon: DollarSign, accent: 'text-muted-foreground' },
    { label: 'Active Users', value: data.activeUsers.toLocaleString(), icon: Users, accent: 'text-blue-600', drillDown: 'active_users', hint: 'Click to see user list' },
    { label: 'Active Challenges', value: data.activeChallenges.toLocaleString(), icon: Trophy, accent: 'text-purple-600', drillDown: 'active_challenges', hint: 'Click to see challenges' },
    { label: 'Funded Accounts', value: data.activeFunded.toLocaleString(), icon: TrendingUp, accent: 'text-emerald-600', drillDown: 'funded_accounts', hint: 'Click to see funded accounts' },
    { label: 'Pending Payouts', value: `${data.pendingPayouts}`, subtitle: formatCurrency(data.pendingPayoutValue), icon: Wallet, accent: 'text-amber-600' },
    { label: 'Pending KYC', value: data.pendingKYC.toLocaleString(), icon: ShieldCheck, accent: 'text-orange-600' },
    { label: 'Open Tickets', value: data.openTickets.toLocaleString(), icon: Headphones, accent: 'text-indigo-600' },
    { label: 'Risk Alerts', value: data.riskAlerts.toLocaleString(), icon: AlertTriangle, accent: data.riskAlerts > 0 ? 'text-red-600' : 'text-muted-foreground' },
    { label: 'Pass Rate', value: `${data.challengePassRate}%`, icon: Trophy, accent: 'text-green-600' },
    { label: 'Fail Rate', value: `${data.challengeFailRate}%`, icon: Trophy, accent: 'text-red-600' },
    { label: 'Staff Online', value: data.staffOnline.toLocaleString(), icon: Users, accent: 'text-green-600', drillDown: 'staff_online', hint: 'Click to see who is online' },
  ];

  return (
    <>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          const isClickable = !!card.drillDown;
          return (
            <Card
              key={card.label}
              className={`transition-colors ${isClickable ? 'cursor-pointer hover:border-primary/40 hover:shadow-sm hover:bg-muted/10 group' : 'hover:border-primary/20'}`}
              onClick={isClickable ? () => setDrillDown(card.drillDown!) : undefined}
              title={card.hint}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
                  <Icon className={`h-3.5 w-3.5 ${card.accent} ${isClickable ? 'group-hover:scale-110 transition-transform' : ''}`} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold leading-none">{loading ? '—' : card.value}</span>
                  {card.delta !== undefined && <DeltaIndicator value={card.delta} />}
                </div>
                {card.subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{card.subtitle}</p>}
                {isClickable && (
                  <p className="text-[9px] text-muted-foreground/50 mt-1 group-hover:text-muted-foreground/80 transition-colors">
                    Click to view details
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DrillDownModal type={drillDown} onClose={() => setDrillDown(null)} />
    </>
  );
}
