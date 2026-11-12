'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { LoadingState } from '@/components/shared/loading-state';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ServiceHealth { service_name: string; status: 'healthy' | 'degraded' | 'down'; response_time_ms: number | null; checked_at: string; }

const statusIcons = { healthy: CheckCircle, degraded: AlertTriangle, down: XCircle };
const statusColors = { healthy: 'text-green-600', degraded: 'text-yellow-600', down: 'text-red-600' };
const statusBg = { healthy: 'bg-green-50 dark:bg-green-900/20', degraded: 'bg-yellow-50 dark:bg-yellow-900/20', down: 'bg-red-50 dark:bg-red-900/20' };

export default function MonitoringPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchHealth(true);
    const interval = setInterval(() => void fetchHealth(), 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchHealth(showLoading = false) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/monitoring/health');
      if (!res.ok) throw new Error(`Health request failed with status ${res.status}`);
      const json = await res.json();
      setServices(json.data || []);
    } catch (fetchError) {
      console.error('[monitoring] Failed to load service health:', fetchError);
      setError('Failed to load service health.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">System Monitoring Center</h1><p className="text-muted-foreground">Infrastructure health and service status (refreshes every 30s)</p></div>
      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void fetchHealth(true)} />
      ) : services.length === 0 ? (
        <EmptyState message="No health checks have been recorded yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((svc) => {
            const Icon = statusIcons[svc.status];
            return (
              <Card key={svc.service_name} className={statusBg[svc.status]}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Icon className={`h-5 w-5 ${statusColors[svc.status]}`} />
                  <CardTitle className="text-base">{svc.service_name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm">
                    <span className={`font-medium capitalize ${statusColors[svc.status]}`}>{svc.status}</span>
                    {svc.response_time_ms !== null && <span className="text-muted-foreground">{svc.response_time_ms}ms</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Last check: {new Date(svc.checked_at).toLocaleTimeString()}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
