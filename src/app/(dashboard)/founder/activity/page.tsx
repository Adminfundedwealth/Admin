'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Clock, User, MousePointer } from 'lucide-react';

interface ActivityEntry {
  id: string;
  staffName: string;
  staffRole: string;
  action: string;
  target: string;
  timestamp: string;
  ipAddress: string;
}

const mockActivity: ActivityEntry[] = [
  { id: '1', staffName: 'Sarah Chen', staffRole: 'Operations Manager', action: 'Approved KYC submission', target: 'user_a8f2...', timestamp: '2 min ago', ipAddress: '192.168.1.45' },
  { id: '2', staffName: 'James Wright', staffRole: 'Finance Manager', action: 'Approved payout', target: '$2,450.00', timestamp: '5 min ago', ipAddress: '10.0.0.12' },
  { id: '3', staffName: 'Aisha Kumar', staffRole: 'Support Agent', action: 'Resolved ticket', target: '#TKT-0042', timestamp: '8 min ago', ipAddress: '172.16.0.8' },
  { id: '4', staffName: 'Sarah Chen', staffRole: 'Operations Manager', action: 'Passed challenge', target: 'ACC-100234', timestamp: '12 min ago', ipAddress: '192.168.1.45' },
  { id: '5', staffName: 'Marcus Johnson', staffRole: 'Risk Manager', action: 'Acknowledged risk alert', target: 'Critical: Drawdown breach', timestamp: '15 min ago', ipAddress: '10.0.0.99' },
  { id: '6', staffName: 'James Wright', staffRole: 'Finance Manager', action: 'Rejected payout', target: '$8,200.00', timestamp: '22 min ago', ipAddress: '10.0.0.12' },
];

export default function StaffActivityPage() {
  const [filter, setFilter] = useState('all');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Activity Feed</h1>
          <p className="text-muted-foreground">Real-time visibility into all staff actions across the system</p>
        </div>
        <div className="flex gap-1">
          {['all', 'mutations', 'logins', 'exports'].map(f => (
            <Button key={f} variant={filter === f ? 'default' : 'ghost'} size="sm" onClick={() => setFilter(f)} className="capitalize text-xs">
              {f}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {mockActivity.map((entry) => (
            <div key={entry.id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/30 transition-colors">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {entry.staffName.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.staffName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entry.staffRole}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {entry.action} → <span className="font-mono text-xs">{entry.target}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{entry.timestamp}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{entry.ipAddress}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
