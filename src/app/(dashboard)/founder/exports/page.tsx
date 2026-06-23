'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Clock, CheckCircle, XCircle } from 'lucide-react';

interface ExportJob {
  id: string;
  source: string;
  records: number;
  status: 'completed' | 'processing' | 'failed';
  createdAt: string;
  expiresAt?: string;
}

const mockExports: ExportJob[] = [
  { id: '1', source: 'Users', records: 12450, status: 'completed', createdAt: '2024-01-15 14:30', expiresAt: '2024-01-16 14:30' },
  { id: '2', source: 'Trades (30 days)', records: 89200, status: 'processing', createdAt: '2024-01-15 14:28' },
  { id: '3', source: 'Payout History', records: 3400, status: 'completed', createdAt: '2024-01-15 12:00', expiresAt: '2024-01-16 12:00' },
  { id: '4', source: 'Audit Logs (Jan)', records: 45000, status: 'failed', createdAt: '2024-01-14 09:15' },
];

const statusConfig = {
  completed: { icon: CheckCircle, color: 'text-green-600', label: 'Ready' },
  processing: { icon: Clock, color: 'text-yellow-600', label: 'Processing' },
  failed: { icon: XCircle, color: 'text-red-600', label: 'Failed' },
};

export default function DataExportCenter() {
  const [exports] = useState(mockExports);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Export Center</h1>
          <p className="text-muted-foreground">Generate and download bulk data exports. Files available for 24 hours.</p>
        </div>
        <Button className="gap-2"><Download className="h-4 w-4" /> New Export</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">4</p><p className="text-xs text-muted-foreground">Total Exports</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">2</p><p className="text-xs text-muted-foreground">Ready to Download</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600">1</p><p className="text-xs text-muted-foreground">Processing</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">150K+</p><p className="text-xs text-muted-foreground">Total Records</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Export History</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {exports.map((exp) => {
            const config = statusConfig[exp.status];
            const Icon = config.icon;
            return (
              <div key={exp.id} className="flex items-center gap-4 px-4 py-3">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{exp.source}</p>
                  <p className="text-xs text-muted-foreground">{exp.records.toLocaleString()} records • {exp.createdAt}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 ${config.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{config.label}</span>
                  </div>
                  {exp.status === 'completed' && (
                    <Button variant="outline" size="sm" className="gap-1"><Download className="h-3 w-3" /> Download</Button>
                  )}
                  {exp.status === 'failed' && (
                    <Button variant="outline" size="sm">Retry</Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
