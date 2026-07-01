'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { Shield, AlertTriangle, Pause, Lock, RefreshCw, Zap } from 'lucide-react';

/**
 * Emergency Controls — Founder-only system overrides.
 * Reads: system_config (via /api/founder/emergency)
 * Writes: system_config, audit_records (via /api/founder/emergency POST)
 * Side effects: lockout_staff invalidates all non-Founder sessions
 */

interface EmergencyControl {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const CONTROL_META: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  halt_payouts: { label: 'Halt All Payouts', description: 'Immediately freeze all pending and future payout processing', icon: <Pause className="h-5 w-5" /> },
  halt_trading: { label: 'Halt New Challenges', description: 'Prevent new challenge account purchases system-wide', icon: <Lock className="h-5 w-5" /> },
  lockout_staff: { label: 'Emergency Staff Lockout', description: 'Invalidate all active staff sessions except Founder accounts', icon: <Shield className="h-5 w-5" /> },
  maintenance_mode: { label: 'Maintenance Mode', description: 'Show maintenance page to all staff except Founders', icon: <RefreshCw className="h-5 w-5" /> },
  disable_registrations: { label: 'Disable User Registrations', description: 'Block new trader sign-ups on the public website', icon: <Lock className="h-5 w-5" /> },
  force_kyc: { label: 'Force KYC Re-verification', description: 'Require all funded traders to re-submit KYC documents', icon: <AlertTriangle className="h-5 w-5" /> },
};

export default function EmergencyControlsPage() {
  const [controls, setControls] = useState<EmergencyControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmModal, setConfirmModal] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetchControls();
  }, []);

  async function fetchControls() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/founder/emergency');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const mapped = (json.data || []).map((c: any) => ({
        key: c.key,
        label: CONTROL_META[c.key]?.label || c.key,
        description: CONTROL_META[c.key]?.description || '',
        icon: CONTROL_META[c.key]?.icon || <Shield className="h-5 w-5" />,
        active: c.active,
        updatedAt: c.updatedAt,
        updatedBy: c.updatedBy,
      }));
      setControls(mapped);
    } catch {
      setError('Failed to load emergency controls.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleControl(key: string) {
    setToggling(key);
    const control = controls.find(c => c.key === key);
    if (!control) return;

    try {
      const res = await apiFetch('/api/founder/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, active: !control.active }),
      });

      if (res.ok) {
        setControls(prev => prev.map(c =>
          c.key === key ? { ...c, active: !c.active, updatedAt: new Date().toISOString() } : c
        ));
      }
    } catch {
      // Refresh state from server
      fetchControls();
    } finally {
      setToggling(null);
      setConfirmModal(null);
    }
  }

  const activeCount = controls.filter(c => c.active).length;

  if (error) return <ErrorState message={error} onRetry={fetchControls} />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Emergency Controls</h1>
          <p className="text-muted-foreground">Founder-only system override controls. All actions are logged.</p>
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/30">
            <Zap className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">{activeCount} active</span>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingState rows={6} />
      ) : (
        <div className="space-y-3">
          {controls.map((control) => (
            <Card key={control.key} className={control.active ? 'border-destructive/50 bg-destructive/5' : ''}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg ${control.active ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  {control.icon}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{control.label}</p>
                  <p className="text-xs text-muted-foreground">{control.description}</p>
                  {control.active && control.updatedAt && (
                    <p className="text-[10px] text-destructive/70 mt-0.5">
                      Activated {new Date(control.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button
                  variant={control.active ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={toggling === control.key}
                  onClick={() => control.active ? toggleControl(control.key) : setConfirmModal(control.key)}
                >
                  {toggling === control.key ? '...' : control.active ? 'Deactivate' : 'Activate'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-background p-6 rounded-xl shadow-2xl w-full max-w-md space-y-4 border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-destructive/10"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
              <h3 className="text-lg font-bold">Confirm Emergency Action</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              You are about to activate <strong>{controls.find(c => c.key === confirmModal)?.label}</strong>.
              This action takes effect immediately and will be recorded in the audit log.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmModal(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={toggling !== null}
                onClick={() => toggleControl(confirmModal)}
              >
                Confirm Activate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
