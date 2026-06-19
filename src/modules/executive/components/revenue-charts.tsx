'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from '@/components/charts';

interface RevenueDataPoint {
  date: string;
  revenue: number;
  challenges: number;
}

/**
 * Revenue trend charts with configurable date ranges (1-365 days, default 30).
 */
export function RevenueCharts() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<RevenueDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevenueData();
  }, [period]);

  async function fetchRevenueData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/revenue?days=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data || []);
      }
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Revenue Trends</CardTitle>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-2 py-1 text-xs rounded ${
                period === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {d === 365 ? '1Y' : `${d}D`}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading && data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Loading chart data...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No revenue data for this period
          </div>
        ) : (
          <LineChart
            data={data}
            xKey="date"
            lines={[
              { key: 'revenue', color: 'hsl(142, 76%, 36%)', name: 'Revenue ($)' },
              { key: 'challenges', color: 'hsl(222, 47%, 50%)', name: 'Challenge Sales' },
            ]}
            height={300}
          />
        )}
      </CardContent>
    </Card>
  );
}
