'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Check, AlertTriangle, DollarSign, Shield, Zap } from 'lucide-react';

interface NotificationItem {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  source: string;
  timestamp: string;
  read: boolean;
}

const mockNotifications: NotificationItem[] = [
  { id: '1', priority: 'critical', title: 'Drawdown Breach Detected', message: 'Account ACC-100234 exceeded max drawdown limit (12.4% vs 10% limit)', source: 'Risk Engine', timestamp: '2 min ago', read: false },
  { id: '2', priority: 'high', title: 'Large Payout Pending', message: '$15,000 payout request from funded trader requires Founder approval', source: 'Payout Center', timestamp: '8 min ago', read: false },
  { id: '3', priority: 'high', title: 'Staff Account Locked', message: 'Sarah Chen locked out after 5 failed login attempts', source: 'Auth System', timestamp: '15 min ago', read: false },
  { id: '4', priority: 'medium', title: 'KYC Queue Growing', message: '24 submissions pending for >24 hours. Compliance team may need support.', source: 'KYC Center', timestamp: '1 hour ago', read: true },
  { id: '5', priority: 'low', title: 'Export Completed', message: 'Your full user export (12,450 records) is ready to download', source: 'Export Center', timestamp: '2 hours ago', read: true },
];

const priorityConfig = {
  critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  high: { icon: Zap, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  medium: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  low: { icon: Bell, color: 'text-muted-foreground', bg: '', dot: 'bg-muted-foreground' },
};

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground">{unreadCount} unread notifications</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === 'all' ? 'default' : 'ghost'} size="sm" onClick={() => setFilter('all')}>All</Button>
          <Button variant={filter === 'unread' ? 'default' : 'ghost'} size="sm" onClick={() => setFilter('unread')}>Unread ({unreadCount})</Button>
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5"><Check className="h-3 w-3" /> Mark all read</Button>
        </div>
      </div>

      <div className="space-y-2">
        {displayed.map((notif) => {
          const config = priorityConfig[notif.priority];
          const Icon = config.icon;
          return (
            <Card key={notif.id} className={`${!notif.read ? config.bg + ' border' : 'opacity-60'}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${config.dot} ${!notif.read ? 'animate-pulse' : ''}`} />
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{notif.title}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{notif.source}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{notif.timestamp}</span>
              </CardContent>
            </Card>
          );
        })}

        {displayed.length === 0 && (
          <div className="text-center py-12">
            <BellOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No {filter === 'unread' ? 'unread ' : ''}notifications</p>
          </div>
        )}
      </div>
    </div>
  );
}
