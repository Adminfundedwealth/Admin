'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, Pause, Lock, RefreshCw, Zap } from 'lucide-react';

interface EmergencyControl {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  variant: 'destructive' | 'warning' | 'default';
}

export default function EmergencyControlsPage() {
  const [controls, setControls] = useState<EmergencyControl[]>([
    { id: 'halt_payouts', label: 'Halt All Payouts', description: 'Immediately freeze all pending and future payout processing', icon: <Pause className="h-5 w-5" />, active: false, variant: 'destructive' },
    { id: 'halt_trading', label: 'Halt New Challenges', description: 'Prevent new challenge account purchases system-wide', icon: <Lock className="h-5 w-5" />, active: false, variant: 'destructive' },
    { id: 'lockout_staff', label: 'Emergency Staff Lockout', description: 'Invalidate all active staff sessions except Founder accounts', icon: <Shield className="h-5 w-5" />, active: false, variant: 'destructive' },
    { id: 'maintenance_mode', label: 'Maintenance Mode', description: 'Show maintenance page to all staff except Founders', icon: <RefreshCw className="h-5 w-5" />, active: false, variant: 'warning' },
    { id: 'disable_registrations', label: 'Disable User Registrations', description: 'Block new trader sign-ups on the public website', icon: <Lock className="h-5 w-5" />, active: false, variant: 'warning' },
    { id: 'force_kyc', label: 'Force KYC Re-verification', description: 'Require all funded traders to re-submit KYC documents', icon: <AlertTriangle className="h-5 w-5" />, active: false, variant: 'warning' },
  ]);

  const [confirmModal, setConfirmModal] = useState<string | null>(null);

  function toggleControl(id: string) {
    setControls(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
    setConfirmModal(null);
  }

  const activeCount = controls.filter(c => c.active).length;

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

      <div className="space-y-3">
        {controls.map((control) => (
          <Card key={control.id} className={control.active ? 'border-destructive/50 bg-destructive/5' : ''}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg ${control.active ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                {control.icon}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{control.label}</p>
                <p className="text-xs text-muted-foreground">{control.description}</p>
              </div>
              <Button
                variant={control.active ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => control.active ? toggleControl(control.id) : setConfirmModal(control.id)}
              >
                {control.active ? 'Deactivate' : 'Activate'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

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
              You are about to activate <strong>{controls.find(c => c.id === confirmModal)?.label}</strong>. This action takes effect immediately and will be recorded in the audit log.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmModal(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => toggleControl(confirmModal)}>Confirm Activate</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
