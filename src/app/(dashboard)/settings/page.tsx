'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, Wallet, Users, Bell } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Configuration & Rule Engine</h1><p className="text-muted-foreground">Configure business rules without code deployment</p></div>
      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/settings/challenge-rules">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Target className="h-8 w-8 text-primary mb-2" /><CardTitle>Challenge Rules</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Profit targets, drawdown limits, trading days, prohibited strategies</p></CardContent>
          </Card>
        </Link>
        <Link href="/settings/payout-rules">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Wallet className="h-8 w-8 text-primary mb-2" /><CardTitle>Payout Rules</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Minimum amounts, frequency, profit split, processing timeframes</p></CardContent>
          </Card>
        </Link>
        <Link href="/settings/affiliate-rules">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Users className="h-8 w-8 text-primary mb-2" /><CardTitle>Affiliate Rules</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Commission rates, payout thresholds, tier structures</p></CardContent>
          </Card>
        </Link>
        <Link href="/settings/notifications">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Bell className="h-8 w-8 text-primary mb-2" /><CardTitle>Notification Templates</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Email templates, system announcements, alert messages</p></CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
