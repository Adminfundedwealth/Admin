'use client';
import { apiFetch } from '@/lib/api/fetch';

import { Suspense } from 'react';
import { KPICards } from '@/modules/executive/components/kpi-cards';
import { RevenueCharts } from '@/modules/executive/components/revenue-charts';
import { OperationalAlerts } from '@/modules/executive/components/operational-alerts';
import { QueueCard } from '@/components/shared/queue-card';
import { KPICard } from '@/components/shared/kpi-card';
import { StaffPresence } from '@/components/shared/staff-presence';
import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Executive Command Center — One-Screen Founder View
// Layout: Revenue Health → Operational Queues → Risk Health → System Health
// ---------------------------------------------------------------------------

export default function ExecutiveCommandCenter() {
  return (
    <div className="space-y-4">
      {/* Header - compact */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Command Center</h1>
          <p className="text-[11px] text-muted-foreground">Real-time business operations</p>
        </div>
        <ComparisonSelector />
      </div>

      {/* Revenue Health — top row */}
      <section aria-label="Revenue Health">
        <Suspense fallback={<SkeletonRow count={4} />}>
          <KPICards />
        </Suspense>
      </section>

      {/* Operational Queues — second row */}
      <section aria-label="Operational Queues">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
          Queues
        </h2>
        <Suspense fallback={<SkeletonRow count={4} />}>
          <QueueSection />
        </Suspense>
      </section>

      {/* Risk Health + Staff — third row, side by side */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-label="Risk Health">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
            Risk Health
          </h2>
          <Suspense fallback={<SkeletonRow count={4} />}>
            <RiskHealthSection />
          </Suspense>
        </section>

        <section aria-label="Staff Presence">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
            Team
          </h2>
          <div className="rounded-md border p-3 max-h-[200px] overflow-y-auto">
            <StaffPresence />
          </div>
        </section>
      </div>

      {/* Operational Alerts */}
      <section aria-label="Alerts">
        <Suspense fallback={null}>
          <OperationalAlerts />
        </Suspense>
      </section>

      {/* Terminal Lifecycle Events */}
      <section aria-label="Lifecycle Events">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
          Terminal Lifecycle
        </h2>
        <Suspense fallback={<SkeletonRow count={1} />}>
          <LifecycleEvents />
        </Suspense>
      </section>

      {/* Revenue Trends */}
      <section aria-label="Revenue Trends">
        <Suspense fallback={<SkeletonRow count={1} />}>
          <RevenueCharts />
        </Suspense>
      </section>

      {/* System Health — compact bottom row */}
      <section aria-label="System Health">
        <Suspense fallback={null}>
          <SystemHealthBar />
        </Suspense>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue Section
// ---------------------------------------------------------------------------

function QueueSection() {
  const [queues, setQueues] = useState({
    payouts: { count: 0, oldest: '—', avg: '—', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
    kyc: { count: 0, oldest: '—', avg: '—', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
    tickets: { count: 0, oldest: '—', avg: '—', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
    risk: { count: 0, oldest: '—', avg: '—', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
  });

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchQueues() {
    try {
      const res = await apiFetch('/api/executive/queues');
      if (res.ok) {
        const data = await res.json();
        setQueues(data);
      }
    } catch {}
  }

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <QueueCard
        name="Pending Payouts"
        count={queues.payouts.count}
        oldestAge={queues.payouts.oldest}
        averageWait={queues.payouts.avg}
        priorityBreakdown={queues.payouts.breakdown}
        warningThreshold={5}
        criticalThreshold={15}
        href="/payouts?status=pending"
      />
      <QueueCard
        name="Pending KYC"
        count={queues.kyc.count}
        oldestAge={queues.kyc.oldest}
        averageWait={queues.kyc.avg}
        priorityBreakdown={queues.kyc.breakdown}
        warningThreshold={10}
        criticalThreshold={30}
        href="/kyc?status=pending"
      />
      <QueueCard
        name="Open Tickets"
        count={queues.tickets.count}
        oldestAge={queues.tickets.oldest}
        averageWait={queues.tickets.avg}
        priorityBreakdown={queues.tickets.breakdown}
        warningThreshold={15}
        criticalThreshold={40}
        href="/support?status=open"
      />
      <QueueCard
        name="Risk Alerts"
        count={queues.risk.count}
        oldestAge={queues.risk.oldest}
        averageWait={queues.risk.avg}
        priorityBreakdown={queues.risk.breakdown}
        warningThreshold={3}
        criticalThreshold={8}
        href="/risk?status=open"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Health Section
// ---------------------------------------------------------------------------

function RiskHealthSection() {
  const [risk, setRisk] = useState({
    accountsAtRisk: 0,
    highestSeverity: 'none',
    capitalExposure: 0,
    breachesToday: 0,
  });

  useEffect(() => {
    fetchRisk();
    const interval = setInterval(fetchRisk, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchRisk() {
    try {
      const res = await apiFetch('/api/executive/risk-health');
      if (res.ok) {
        const data = await res.json();
        setRisk(data);
      }
    } catch {}
  }

  const exposureColor = risk.capitalExposure < 5 ? 'text-emerald-500' : risk.capitalExposure < 15 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <KPICard
        label="Accounts at Risk"
        value={risk.accountsAtRisk}
        className={risk.accountsAtRisk > 0 ? 'border-amber-500/40' : ''}
      />
      <KPICard
        label="Highest Alert"
        value={risk.highestSeverity === 'none' ? '—' : risk.highestSeverity}
        className={risk.highestSeverity === 'critical' ? 'border-red-500/40' : ''}
      />
      <KPICard
        label="Capital Exposure"
        value={`${risk.capitalExposure.toFixed(1)}%`}
        className={risk.capitalExposure >= 15 ? 'border-red-500/40' : ''}
      />
      <KPICard
        label="Breaches Today"
        value={risk.breachesToday}
        className={risk.breachesToday > 0 ? 'border-red-500/40' : ''}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Health Bar
// ---------------------------------------------------------------------------

function SystemHealthBar() {
  const [services, setServices] = useState<{ name: string; status: 'healthy' | 'degraded' | 'down' }[]>([
    { name: 'API', status: 'healthy' },
    { name: 'Database', status: 'healthy' },
    { name: 'WebSocket', status: 'healthy' },
    { name: 'Email', status: 'healthy' },
    { name: 'Payments', status: 'healthy' },
    { name: 'Jobs', status: 'healthy' },
  ]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchHealth() {
    try {
      const res = await apiFetch('/api/executive/system-health');
      if (res.ok) {
        const data = await res.json();
        if (data.services) setServices(data.services);
      }
    } catch {}
  }

  const statusDot = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-4 h-10 px-3 rounded-md border bg-muted/20">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Systems</span>
      <div className="flex items-center gap-3">
        {services.map((svc) => (
          <div key={svc.name} className="flex items-center gap-1.5" title={`${svc.name}: ${svc.status}`}>
            <span className={`h-2 w-2 rounded-full ${statusDot[svc.status]}`} />
            <span className="text-[11px] text-muted-foreground">{svc.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison Period Selector
// ---------------------------------------------------------------------------

function ComparisonSelector() {
  const [period, setPeriod] = useState('yesterday');
  return (
    <select
      value={period}
      onChange={(e) => setPeriod(e.target.value)}
      className="h-7 rounded-md border bg-background px-2 text-[11px] text-muted-foreground"
      aria-label="Comparison period"
    >
      <option value="yesterday">vs Yesterday</option>
      <option value="last_week">vs Last Week</option>
      <option value="last_month">vs Last Month</option>
      <option value="same_day_last_month">vs Same Day Last Month</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Terminal Lifecycle Events
// ---------------------------------------------------------------------------

function LifecycleEvents() {
  const [events, setEvents] = useState<Array<{
    id: string;
    type: string;
    category: string;
    severity: string;
    description: string;
    linkTo: string;
    timestamp: string;
  }>>([]);

  useEffect(() => {
    fetchLifecycle();
    const interval = setInterval(fetchLifecycle, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchLifecycle() {
    try {
      const res = await apiFetch('/api/integration/lifecycle?hours=12');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.data?.slice(0, 8) || []);
      }
    } catch {}
  }

  const severityColor: Record<string, string> = {
    critical: 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10',
    high: 'border-l-orange-500 bg-orange-50/30 dark:bg-orange-900/10',
    warning: 'border-l-amber-400',
    success: 'border-l-emerald-500',
    info: 'border-l-blue-400',
  };

  if (events.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-3 px-3 border rounded-md">
        No recent lifecycle events.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((evt) => (
        <div
          key={evt.id}
          className={`border-l-2 pl-3 py-1.5 rounded-r-sm ${severityColor[evt.severity] || ''}`}
        >
          <p className="text-[12px] text-foreground leading-snug">{evt.description}</p>
          <span className="text-[10px] text-muted-foreground">
            {new Date(evt.timestamp).toLocaleTimeString()} · {evt.category}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton Loading
// ---------------------------------------------------------------------------

function SkeletonRow({ count }: { count: number }) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-20 rounded-md border bg-muted/20 animate-pulse" />
      ))}
    </div>
  );
}
