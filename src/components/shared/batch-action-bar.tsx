'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, CheckCircle, XCircle, RotateCcw, AlertTriangle, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react';

export interface BatchAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant: 'default' | 'destructive' | 'outline';
  requiresReason?: boolean;
  minReasonLength?: number;
}

interface BatchActionBarProps {
  selectedCount: number;
  actions: BatchAction[];
  onAction: (actionId: string, reason?: string) => Promise<void>;
  onClear: () => void;
}

export function BatchActionBar({ selectedCount, actions, onAction, onClear }: BatchActionBarProps) {
  const [confirmAction, setConfirmAction] = useState<BatchAction | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  if (selectedCount === 0) return null;

  async function handleConfirm() {
    if (!confirmAction) return;
    if (confirmAction.requiresReason && reason.length < (confirmAction.minReasonLength ?? 10)) return;
    setProcessing(true);
    try {
      await onAction(confirmAction.id, confirmAction.requiresReason ? reason : undefined);
      setConfirmAction(null);
      setReason('');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      {/* Floating action bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-background/95 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-2 pr-3 border-r">
          <span className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
            {selectedCount}
          </span>
          <span className="text-sm font-medium">selected</span>
          <button onClick={onClear} className="ml-1 p-0.5 rounded hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
        </div>

        {actions.map((action) => (
          <Button
            key={action.id}
            variant={action.variant}
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => action.requiresReason ? setConfirmAction(action) : onAction(action.id)}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>

      {/* Confirmation modal for actions requiring reason */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setConfirmAction(null); setReason(''); }} />
          <div className="relative bg-background p-6 rounded-xl shadow-2xl border w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">{confirmAction.icon}</div>
              <div>
                <h3 className="font-bold">{confirmAction.label}</h3>
                <p className="text-xs text-muted-foreground">{selectedCount} items will be affected</p>
              </div>
            </div>

            {confirmAction.requiresReason && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason (min {confirmAction.minReasonLength ?? 10} chars)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for this batch action..."
                  className="w-full min-h-[80px] rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[10px] text-muted-foreground">{reason.length}/{confirmAction.minReasonLength ?? 10} min</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <p className="flex-1 text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> This action will be logged in the audit trail
              </p>
              <Button variant="outline" size="sm" onClick={() => { setConfirmAction(null); setReason(''); }}>Cancel</Button>
              <Button
                variant={confirmAction.variant}
                size="sm"
                onClick={handleConfirm}
                disabled={processing || (confirmAction.requiresReason && reason.length < (confirmAction.minReasonLength ?? 10))}
              >
                {processing ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Pre-configured batch actions for each module
export const PAYOUT_BATCH_ACTIONS: BatchAction[] = [
  { id: 'approve', label: 'Approve All', icon: <CheckCircle className="h-3.5 w-3.5" />, variant: 'default' },
  { id: 'reject', label: 'Reject All', icon: <XCircle className="h-3.5 w-3.5" />, variant: 'destructive', requiresReason: true, minReasonLength: 10 },
];

export const KYC_BATCH_ACTIONS: BatchAction[] = [
  { id: 'approve', label: 'Approve All', icon: <CheckCircle className="h-3.5 w-3.5" />, variant: 'default' },
  { id: 'resubmit', label: 'Request Reupload', icon: <RotateCcw className="h-3.5 w-3.5" />, variant: 'outline', requiresReason: true, minReasonLength: 10 },
];

export const CHALLENGE_BATCH_ACTIONS: BatchAction[] = [
  { id: 'pass', label: 'Pass All', icon: <CheckCircle className="h-3.5 w-3.5" />, variant: 'default', requiresReason: true, minReasonLength: 20 },
  { id: 'fail', label: 'Fail All', icon: <XCircle className="h-3.5 w-3.5" />, variant: 'destructive', requiresReason: true, minReasonLength: 20 },
  { id: 'reset', label: 'Reset All', icon: <RotateCcw className="h-3.5 w-3.5" />, variant: 'outline', requiresReason: true, minReasonLength: 10 },
];

export const RISK_BATCH_ACTIONS: BatchAction[] = [
  { id: 'acknowledge', label: 'Acknowledge All', icon: <CheckCircle className="h-3.5 w-3.5" />, variant: 'default' },
  { id: 'resolve', label: 'Resolve All', icon: <CheckCircle className="h-3.5 w-3.5" />, variant: 'outline', requiresReason: true, minReasonLength: 10 },
];

export const CERTIFICATE_BATCH_ACTIONS: BatchAction[] = [
  { id: 'regenerate', label: 'Regenerate All', icon: <RefreshCw className="h-3.5 w-3.5" />, variant: 'default' },
  { id: 'resend',     label: 'Resend Email',   icon: <Send className="h-3.5 w-3.5" />,      variant: 'outline' },
  { id: 'verify',     label: 'Verify All',     icon: <ShieldCheck className="h-3.5 w-3.5" />, variant: 'outline' },
  { id: 'delete',     label: 'Delete All',     icon: <Trash2 className="h-3.5 w-3.5" />,    variant: 'destructive', requiresReason: true, minReasonLength: 10 },
];
