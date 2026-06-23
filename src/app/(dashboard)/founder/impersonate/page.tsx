'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Search, AlertTriangle } from 'lucide-react';

export default function ImpersonatePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [results, setResults] = useState<{ id: string; name: string; email: string; role: string }[]>([]);

  async function handleSearch() {
    if (searchQuery.length < 2) return;
    // Simulated — will connect to real API
    setResults([
      { id: '1', name: 'Sarah Chen', email: 'sarah@fundedwealth.com', role: 'Operations Manager' },
      { id: '2', name: 'James Wright', email: 'james@fundedwealth.com', role: 'Finance Manager' },
      { id: '3', name: 'Aisha Kumar', email: 'aisha@fundedwealth.com', role: 'Support Agent' },
    ]);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impersonation Mode</h1>
        <p className="text-muted-foreground">View the system as another staff member sees it. All actions are logged.</p>
      </div>

      {impersonating && (
        <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-warning bg-warning/10">
          <Eye className="h-5 w-5 text-warning" />
          <div className="flex-1">
            <p className="font-semibold">Currently impersonating: {impersonating}</p>
            <p className="text-xs text-muted-foreground">All navigation reflects their permissions. No write actions will execute.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImpersonating(null)} className="gap-1.5">
            <EyeOff className="h-3.5 w-3.5" /> End Session
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find Staff Member</CardTitle>
          <CardDescription>Search by name or email to begin impersonation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search staff by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((staff) => (
                <div key={staff.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {staff.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{staff.name}</p>
                    <p className="text-xs text-muted-foreground">{staff.email} • {staff.role}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setImpersonating(staff.name)} className="gap-1.5">
                    <Eye className="h-3 w-3" /> Impersonate
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Audit Notice</p>
            <p className="text-muted-foreground">All impersonation sessions are recorded in the audit log with your Founder identity. Impersonation is read-only — no mutations are executed under the impersonated identity.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
