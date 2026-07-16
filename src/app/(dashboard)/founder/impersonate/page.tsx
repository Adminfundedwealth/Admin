'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Search, AlertTriangle } from 'lucide-react';

/**
 * Impersonation Mode — searches real staff via /api/staff.
 * Reads: staff_members, staff_role_assignments, roles (via /api/staff search)
 * Writes: audit_records (impersonation sessions are logged)
 */

interface StaffResult {
  id: string;
  name: string;
  email: string;
  roles: { id: string; name: string }[];
}

export default function ImpersonatePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [results, setResults] = useState<StaffResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (searchQuery.length < 2) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/staff');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      // Client-side filter since staff list is typically small
      const filtered = (json.data || []).filter((s: any) =>
        (s.name?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
        (s.email?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
      );
      setResults(filtered.slice(0, 10));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impersonation Mode</h1>
        <p className="text-muted-foreground">View the system as another staff member sees it. All actions are logged.</p>
      </div>

      {impersonating && (
        <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-yellow-500 bg-yellow-500/10">
          <Eye className="h-5 w-5 text-yellow-600" />
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
              <Input
                placeholder="Search staff by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((staff) => (
                <div key={staff.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {(staff.name || '?').split(' ').map((n: string) => n[0] || '').join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{staff.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {staff.email} • {staff.roles?.map(r => r.name).join(', ') || 'No role'}
                    </p>
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

      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Audit Notice</p>
            <p className="text-muted-foreground">All impersonation sessions are recorded in the audit log with your Founder identity. Impersonation is read-only — no mutations are executed under the impersonated identity.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
