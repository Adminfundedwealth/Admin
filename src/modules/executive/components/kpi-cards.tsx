'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Trophy, TrendingUp, DollarSign, Wallet, ShieldCheck, Headphones, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface KPIData {
  activeUsers: number;
  activeChallenges: number;
  activeFunded: number;
  revenueMTD: number;
  revenueDaily: number;
  pendingPayouts: number;
  pendingKYC: number;
  openTickets: number;
  riskAlerts: number;
}

const defaultKPI: KPIData = {
  activeUsers: 0,
  activeChallenges: 0,
  activeFunded: 0,
  revenueMTD: 0,
  revenueDaily: 0,
  pendingPayouts: 0,
  pendingKYC: 0,
  openTickets: 0,
  riskAlerts: 0,
};

export function KPICards() {
  const [data, setData] = useState<KPIData>(defaultKPI);
  const [stale, setStale] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs();
    // Refresh every 30 seconds
    const interval = setInterval(fetchKPIs, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchKPIs() {
    try {
      const res = await fetch('/api/executive/metrics');
      if (res.ok) {
        const json = await res.json();
        setData(json.data || defaultKPI);
        setStale({});
      } else {
        // Mark data as stale
        setStale((prev) => ({ ...prev, all: new Date().toISOString() }));
      }
    } catch {
      setStale((prev) => ({ ...prev, all: new Date().toISOString() }));
    } finally {
      setLoading(false);
    }
  }

  const cards = [
    { title: 'Active Users', value: data.activeUsers.toLocaleString(), icon: Users, subtitle: 'Last 30 days activity' },
    { title: 'Active Challenges', value: data.activeChallenges.toLocaleString(), icon: Trophy, subtitle: 'Currently in evaluation' },
    { title: 'Funded Accounts', value: data.activeFunded.toLocaleString(), icon: TrendingUp, subtitle: 'Active funded traders' },
    { title: 'Revenue (MTD)', value: formatCurrency(data.revenueMTD), icon: DollarSign, subtitle: `Today: ${formatCurrency(data.revenueDaily)}` },
    { title: 'Pending Payouts', value: data.pendingPayouts.toLocaleString(), icon: Wallet, subtitle: 'Awaiting review' },
    { title: 'Pending KYC', value: data.pendingKYC.toLocaleString(), icon: ShieldCheck, subtitle: 'In review queue' },
    { title: 'Open Tickets', value: data.openTickets.toLocaleString(), icon: Headphones, subtitle: 'Support queue' },
    { title: 'Risk Alerts', value: data.riskAlerts.toLocaleString(), icon: AlertTriangle, subtitle: 'Active alerts' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="relative">
            {stale.all && (
              <div className="absolute top-2 right-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-warning animate-pulse" title="Data may be stale" />
              </div>
            )}
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? '—' : card.value}
              </div>
              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
