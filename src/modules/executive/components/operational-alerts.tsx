'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

interface OperationalAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'warning' | 'informational';
  kpiName: string;
  currentValue: string;
  threshold: string;
  recommendedAction: string;
  timestamp: string;
}

const severityConfig: Record<string, {
  icon: React.ElementType;
  bg: string;
  text: string;
  label: string;
}> = {
  critical: {
    icon: XCircle,
    bg: 'bg-destructive/10 border-destructive/30',
    text: 'text-destructive',
    label: 'Critical',
  },
  high: {
    icon: XCircle,
    bg: 'bg-destructive/10 border-destructive/30',
    text: 'text-destructive',
    label: 'High',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-warning/10 border-warning/30',
    text: 'text-warning',
    label: 'Warning',
  },
  medium: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/10 border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Medium',
  },
  low: {
    icon: Info,
    bg: 'bg-blue-500/10 border-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Low',
  },
  informational: {
    icon: Info,
    bg: 'bg-blue-500/10 border-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Info',
  },
};

const defaultSeverityConfig = severityConfig.informational;

/**
 * Operational alerts shown when KPI values cross configured thresholds.
 * Displays within 10 seconds of threshold breach.
 */
export function OperationalAlerts() {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);

  useEffect(() => {
    fetchAlerts();
    // Poll every 10 seconds
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/executive/alerts');
      if (res.ok) {
        const json = await res.json();
        setAlerts(json.data || []);
      }
    } catch {
      // Keep existing alerts
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const config = severityConfig[alert.severity] ?? defaultSeverityConfig;
        const Icon = config.icon;

        return (
          <div
            key={alert.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg}`}
            role="alert"
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${config.text}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold uppercase ${config.text}`}>
                  {config.label}
                </span>
                <span className="text-sm font-medium">{alert.kpiName}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Current: <strong>{alert.currentValue}</strong> (threshold: {alert.threshold})
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Recommended: {alert.recommendedAction}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
