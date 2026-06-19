'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Megaphone, Tag, Bell } from 'lucide-react';

export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Marketing Operations Center</h1><p className="text-muted-foreground">Campaigns, promotions, announcements, and coupons</p></div>
      <div className="grid gap-6 md:grid-cols-3">
        <Link href="/marketing/promotions">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Megaphone className="h-8 w-8 text-primary mb-2" /><CardTitle>Promotions</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Manage discount promotions with configurable rules</p></CardContent>
          </Card>
        </Link>
        <Link href="/marketing/coupons">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Tag className="h-8 w-8 text-primary mb-2" /><CardTitle>Coupons</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Create and manage coupon codes with usage limits</p></CardContent>
          </Card>
        </Link>
        <Link href="/marketing/announcements">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader><Bell className="h-8 w-8 text-primary mb-2" /><CardTitle>Announcements</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">System-wide announcements to traders</p></CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
