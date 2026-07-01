'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { Download, Clock, CheckCircle, XCircle, FileText } from 'lucide-react';

/**
 * Data Exports — reads from data_exports table.
 * Reads: data_exports (via /api/founder/exports)
 * Writes: data_exports, audit_records (via /api/export POST)
 */

interface ExportRecord {
  id: string;
  staff_id: string;
  source_center: string;
  filters: Record<string, unknown> | null;
  record_count: number;
  status: string;
  file_url: string | null;
  created_at: string;
  expires_at: string | null;
}

const statusIcons: Record<string, React.ReactNode> = {
  processing: <Clock className="h-4 w-4 text-yellow-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  expired: <XCircle className="h-4 w-4 text-gray-400" />,
};

export default function DataExportsPage() {
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetchExports();
  }, []);

  async function fetchExports() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/founder/exports');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setExports(json.data || []);
    } catch {
      setError('Failed to load exports.');
    } finally {
      setLoading(false);
    }
  }

  async function triggerExport(sourceCenter: string) {
    setExporting(sourceCenter);
    try {
      const res = await apiFetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCenter, filters: {} }),
      });
      if (res.ok) {
        fetchExports();
      }
    } catch {
      // ignore
    } finally {
      setExporting(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={fetchExports} />;

  const exportSources = ['users', 'orders', 'challenges', 'payouts', 'payments', 'kyc', 'support', 'audit'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Exports</h1>
        <p className="text-muted-foreground">Generate and download data exports. Max 500,000 records per export.</p>
      </div>

      {/* Quick Export Actions */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {exportSources.map(source => (
          <Button
            key={source}
            variant="outline"
            className="h-auto py-3 flex flex-col items-center gap-1"
            disabled={exporting === source}
            onClick={() => triggerExport(source)}
          >
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs capitalize">{exporting === source ? 'Exporting...' : `Export ${source}`}</span>
          </Button>
        ))}
      </div>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState rows={5} />
          ) : exports.length === 0 ? (
            <EmptyState message="No exports yet. Use the buttons above to generate one." />
          ) : (
            <div className="space-y-2">
              {exports.map(exp => (
                <div key={exp.id} className="flex items-center gap-3 p-3 rounded border">
                  {statusIcons[exp.status] || statusIcons.processing}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize">{exp.source_center} Export</p>
                    <p className="text-xs text-muted-foreground">
                      {exp.record_count.toLocaleString()} records • {new Date(exp.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${exp.status === 'completed' ? 'text-green-600' : exp.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>
                    {exp.status}
                  </span>
                  {exp.status === 'completed' && exp.file_url && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={exp.file_url} download><Download className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
