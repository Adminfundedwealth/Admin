'use client';

/**
 * DeleteArchiveModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder-only modal for deleting or archiving a trading account.
 *
 * Flow:
 *  1. Pre-flight GET call → shows validation status (open positions, funded, etc.)
 *  2. User picks action: Archive or Permanent Delete
 *  3. User types the account_code to confirm
 *  4. User types a deletion reason (min 20 chars)
 *  5. If account is funded → shows Founder Override toggle
 *  6. Submit → POST → success callback removes card from parent state
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Archive, Trash2, CheckCircle, X,
  Loader2, ShieldAlert, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/fetch';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Validations {
  open_positions: number;
  pending_orders: number;
  is_funded: boolean;
  can_delete: boolean;
  requires_founder_override: boolean;
}

interface PreflightData {
  account_id: string;
  account_code: string;
  challenge_account: Record<string, unknown> | null;
  trading_account: Record<string, unknown> | null;
  validations: Validations;
}

export interface DeleteArchiveModalProps {
  /** ID of the challenge_account or trading_account to act on */
  accountId: string;
  /** Human-readable label shown in the modal header */
  accountLabel: string;
  /** Called when the modal should close (cancelled or success) */
  onClose: () => void;
  /** Called after a successful delete/archive so the parent can remove the card */
  onSuccess: (action: 'archive' | 'permanent_delete', accountId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DeleteArchiveModal({
  accountId,
  accountLabel,
  onClose,
  onSuccess,
}: DeleteArchiveModalProps) {
  const [step, setStep] = useState<'preflight' | 'confirm'>('preflight');
  const [preflight, setPreflight] = useState<PreflightData | null>(null);
  const [preflightError, setPreflightError] = useState('');
  const [preflightLoading, setPreflightLoading] = useState(true);

  const [action, setAction] = useState<'archive' | 'permanent_delete'>('archive');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [reason, setReason] = useState('');
  const [founderOverride, setFounderOverride] = useState(false);
  const [showOverrideHint, setShowOverrideHint] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Pre-flight check ────────────────────────────────────────────────────────
  const runPreflight = useCallback(async () => {
    setPreflightLoading(true);
    setPreflightError('');
    try {
      const res = await apiFetch(
        `/api/founder/trading-accounts/${accountId}/delete-archive`,
      );
      const json = await res.json();
      if (!res.ok) {
        setPreflightError(json.error?.message || 'Failed to load account validation');
        return;
      }
      setPreflight(json.data);
      setStep('confirm');
    } catch {
      setPreflightError('Network error. Could not load account validation.');
    } finally {
      setPreflightLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    runPreflight();
  }, [runPreflight]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preflight) return;

    setSubmitError('');

    // Client-side validation
    if (confirmationCode.trim() !== String(preflight.account_code).trim()) {
      setSubmitError(
        `Type exactly: ${preflight.account_code}`,
      );
      return;
    }
    if (reason.trim().length < 20) {
      setSubmitError('Reason must be at least 20 characters.');
      return;
    }
    if (
      action === 'permanent_delete' &&
      preflight.validations.is_funded &&
      !founderOverride
    ) {
      setSubmitError(
        'This account is funded. Enable Founder Override to proceed.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/founder/trading-accounts/${accountId}/delete-archive`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            confirmation_code: confirmationCode.trim(),
            deletion_reason: reason.trim(),
            founder_override: founderOverride,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error?.message || 'Action failed. Please try again.');
        return;
      }
      onSuccess(action, accountId);
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Keyboard close ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const v = preflight?.validations;
  const accountCode = preflight?.account_code ?? '';
  const codeMatches =
    confirmationCode.trim() === String(accountCode).trim() &&
    confirmationCode.trim() !== '';
  const reasonOk = reason.trim().length >= 20;
  const canSubmit =
    codeMatches &&
    reasonOk &&
    !submitting &&
    (action !== 'permanent_delete' || !v?.is_funded || founderOverride);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete or Archive Account"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-background rounded-xl shadow-2xl border w-full max-w-lg overflow-hidden">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-destructive/5">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-destructive">
                  Delete / Archive Account
                </h2>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {accountLabel}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Loading state */}
            {preflightLoading && (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Validating account state…</p>
              </div>
            )}

            {/* Pre-flight error */}
            {!preflightLoading && preflightError && (
              <div className="space-y-3">
                <ErrorBox message={preflightError} />
                <Button variant="outline" size="sm" onClick={runPreflight}>
                  Retry
                </Button>
              </div>
            )}

            {/* ── Confirm step ── */}
            {!preflightLoading && !preflightError && preflight && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* ── Validation summary ── */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Account Validation
                  </p>
                  <ValidationRow
                    label="Open Positions"
                    ok={v!.open_positions === 0}
                    value={
                      v!.open_positions === 0
                        ? 'None'
                        : `${v!.open_positions} open — must close first`
                    }
                    blocking={v!.open_positions > 0}
                  />
                  <ValidationRow
                    label="Pending Orders"
                    ok={v!.pending_orders === 0}
                    value={
                      v!.pending_orders === 0
                        ? 'None'
                        : `${v!.pending_orders} pending — must cancel first`
                    }
                    blocking={v!.pending_orders > 0}
                  />
                  <ValidationRow
                    label="Account Status"
                    ok={!v!.is_funded}
                    value={
                      v!.is_funded
                        ? 'Funded (requires Founder Override)'
                        : (preflight.challenge_account?.status as string) || 'Not funded'
                    }
                    blocking={false}
                  />
                  <ValidationRow
                    label="Account Code"
                    ok
                    value={String(accountCode)}
                    mono
                  />
                </div>

                {/* Blocking: has open positions or pending orders */}
                {(!v!.can_delete) && (
                  <div className="flex items-start gap-2.5 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Resolve all open positions and pending orders before
                      deleting or archiving this account.
                    </span>
                  </div>
                )}

                {/* ── Action selector ── */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Choose Action</p>
                  <div className="grid grid-cols-2 gap-3">
                    <ActionCard
                      selected={action === 'archive'}
                      onClick={() => setAction('archive')}
                      icon={<Archive className="h-5 w-5" />}
                      title="Archive"
                      description="Hides the account from the dashboard. All historical data preserved. Reversible."
                      color="amber"
                    />
                    <ActionCard
                      selected={action === 'permanent_delete'}
                      onClick={() => setAction('permanent_delete')}
                      icon={<Trash2 className="h-5 w-5" />}
                      title="Permanent Delete"
                      description="Removes the trading account and purges credentials. Challenge data archived for audit. Irreversible."
                      color="red"
                    />
                  </div>
                </div>

                {/* ── Permanent delete warnings ── */}
                {action === 'permanent_delete' && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-1.5 text-sm">
                    <p className="font-semibold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      This action is irreversible
                    </p>
                    <ul className="text-muted-foreground space-y-0.5 text-xs list-disc ml-4">
                      <li>Trading account row will be hard-deleted</li>
                      <li>Terminal credentials purged from emergency_credentials</li>
                      <li>Provisioning log references nullified</li>
                      <li>Challenge account archived (history preserved)</li>
                      <li>Full audit record written to account_deletions</li>
                    </ul>
                  </div>
                )}

                {/* ── Founder Override (funded accounts only) ── */}
                {v!.is_funded && action === 'permanent_delete' && (
                  <div className="rounded-lg border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                          Founder Override Required
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                          This account is funded. Permanent deletion requires
                          explicit override.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOverrideHint((v) => !v)}
                        className="text-amber-600 hover:text-amber-800 transition-colors"
                      >
                        {showOverrideHint ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={founderOverride}
                        onChange={(e) => setFounderOverride(e.target.checked)}
                        className="h-4 w-4 rounded border-amber-400 accent-amber-600"
                      />
                      <span className="text-sm text-amber-800 dark:text-amber-400">
                        I acknowledge this is a funded account and authorise
                        permanent deletion
                      </span>
                    </label>
                  </div>
                )}

                {/* ── Confirmation code ── */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Type the account code to confirm{' '}
                    <span className="font-mono font-bold text-primary">
                      {String(accountCode)}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    placeholder={String(accountCode)}
                    autoComplete="off"
                    spellCheck={false}
                    className={`w-full px-3 py-2 border rounded-md bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors ${
                      confirmationCode && !codeMatches
                        ? 'border-destructive ring-1 ring-destructive/40'
                        : confirmationCode && codeMatches
                        ? 'border-green-500 ring-1 ring-green-500/30'
                        : ''
                    }`}
                  />
                  {confirmationCode && codeMatches && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Code confirmed
                    </p>
                  )}
                  {confirmationCode && !codeMatches && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Code does not match
                    </p>
                  )}
                </div>

                {/* ── Deletion reason ── */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Reason for deletion{' '}
                    <span className="text-muted-foreground font-normal">
                      (min 20 characters)
                    </span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide a clear reason that will be recorded in the permanent audit log…"
                    rows={3}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p
                    className={`text-xs ${
                      reason.length >= 20
                        ? 'text-green-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {reason.length} / 20 minimum
                    {reason.length >= 20 && (
                      <CheckCircle className="inline h-3 w-3 ml-1" />
                    )}
                  </p>
                </div>

                {/* Submit error */}
                {submitError && <ErrorBox message={submitError} />}

                {/* ── Actions ── */}
                <div className="flex justify-end gap-2 pt-1 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant={action === 'permanent_delete' ? 'destructive' : 'default'}
                    disabled={!canSubmit || !v!.can_delete}
                    className="gap-2 min-w-[140px]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {action === 'archive' ? 'Archiving…' : 'Deleting…'}
                      </>
                    ) : action === 'archive' ? (
                      <>
                        <Archive className="h-4 w-4" />
                        Archive Account
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Permanently Delete
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ValidationRow({
  label,
  ok,
  value,
  blocking = false,
  mono = false,
}: {
  label: string;
  ok: boolean;
  value: string;
  blocking?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`flex items-center gap-1 ${
          blocking
            ? 'text-destructive font-medium'
            : ok
            ? 'text-green-600'
            : 'text-amber-600'
        } ${mono ? 'font-mono text-xs' : ''}`}
      >
        {blocking ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        ) : ok ? (
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
        {value}
      </span>
    </div>
  );
}

function ActionCard({
  selected,
  onClick,
  icon,
  title,
  description,
  color,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'amber' | 'red';
}) {
  const ring =
    color === 'red'
      ? 'border-destructive ring-destructive/40'
      : 'border-amber-500 ring-amber-400/40';
  const iconColor =
    color === 'red' ? 'text-destructive' : 'text-amber-600';
  const bg =
    color === 'red'
      ? 'bg-destructive/5'
      : 'bg-amber-50/60 dark:bg-amber-950/20';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all space-y-1 ${
        selected
          ? `${ring} ring-2 ${bg}`
          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
      }`}
    >
      <div className={`${iconColor} mb-1`}>{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {description}
      </p>
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
