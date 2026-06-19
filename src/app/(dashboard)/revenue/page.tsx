'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from '@/components/charts';
import { formatCurrency } from '@/lib/utils';

export default function RevenuePage() {
  const [period, setPeriod] = useState(30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Revenue Intelligence Center</h1><p className="text-muted-foreground">Revenue analytics and financial reporting</p></div>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((d) => (
            <button key={d} onClick={() => setPeriod(d)} className={`px-3 py-1.5 text-xs rounded ${period === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {d === 365 ? '1Y' : `${d}D`}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Order Value</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Refund Rate</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">0%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Chargeback Rate</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">0%</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader><CardContent><div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">Connect revenue data source to display charts</div></CardContent></Card>
    </div>
  );
}
