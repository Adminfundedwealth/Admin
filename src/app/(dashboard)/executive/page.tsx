import { Suspense } from 'react';
import { KPICards } from '@/modules/executive/components/kpi-cards';
import { ActivityFeed } from '@/modules/executive/components/activity-feed';
import { RevenueCharts } from '@/modules/executive/components/revenue-charts';
import { OperationalAlerts } from '@/modules/executive/components/operational-alerts';
import { LoadingState } from '@/components/shared';

export default function ExecutiveCommandCenter() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Command Center</h1>
        <p className="text-muted-foreground">
          Real-time overview of all business operations
        </p>
      </div>

      {/* KPI Cards */}
      <Suspense fallback={<LoadingState rows={2} />}>
        <KPICards />
      </Suspense>

      {/* Operational Alerts */}
      <Suspense fallback={null}>
        <OperationalAlerts />
      </Suspense>

      {/* Revenue Charts & Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<LoadingState rows={4} />}>
            <RevenueCharts />
          </Suspense>
        </div>
        <div>
          <Suspense fallback={<LoadingState rows={6} />}>
            <ActivityFeed />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
