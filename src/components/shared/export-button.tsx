'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

interface ExportButtonProps {
  sourceCenter: string;
  // Accept any object shape — each page defines its own typed Filters interface
  filters?: object;
  totalCount?: number;
  className?: string;
}

/**
 * Export button for CSV exports.
 * Synchronous for ≤10k records, async for >10k (notification on completion).
 */
export function ExportButton({
  sourceCenter,
  filters,
  totalCount,
  className,
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleExport() {
    setExporting(true);
    setMessage('');

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCenter, filters }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error?.message || 'Export failed');
        return;
      }

      const contentType = res.headers.get('content-type');

      if (contentType?.includes('text/csv')) {
        // Synchronous export — download the file directly
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sourceCenter}_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Async export — show message
        const data = await res.json();
        setMessage(data.message || 'Export processing. You will be notified when ready.');
      }
    } catch {
      setMessage('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={exporting}
        className="gap-2"
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export CSV
        {totalCount !== undefined && totalCount > 10000 && (
          <span className="text-xs text-muted-foreground">(async)</span>
        )}
      </Button>
      {message && (
        <p className="text-xs text-muted-foreground mt-1">{message}</p>
      )}
    </div>
  );
}
