'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Preview {
  customer: { id: string; email: string; name: string | null };
  account: {
    id: string;
    accountCode: string;
    challengeType: string;
    plan: string;
    status: string;
    challengeStatus: string;
    initialBalance: number;
    currentBalance: number;
    rules: {
      profitTargetPct: number;
      dailyLossLimitPct: number;
      maxDrawdownPct: number;
      minTradingDays: number;
    };
  };
  terminalRuleAction: string;
  provisioning: { id: string; source: string; status: string };
  identityAction: 'reuse_existing_identity' | 'invite_existing_customer';
  accountAction: 'already_linked' | 'create_terminal_mapping';
}

export default function TerminalAccountLinkPage() {
  const [accountId, setAccountId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(mode: 'preview' | 'confirm') {
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/founder/terminal-account-link', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          trading_account_id: accountId.trim(),
          ...(mode === 'confirm' ? { confirmation } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          typeof result?.error === 'string'
            ? result.error
            : result?.error?.message || 'The account-link request failed.',
        );
        return;
      }
      if (mode === 'preview') {
        setPreview(result.preview as Preview);
        setConfirmation('');
      } else {
        setComplete(true);
        setMessage(result.result?.created
          ? 'The existing account mapping was created. An invitation was sent only if the terminal identity did not exist.'
          : 'The account was already linked; no duplicate identity or mapping was created.');
      }
    } catch {
      setMessage('The Admin OS could not reach the account-link service.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Link Existing Terminal Account</h1>
        <p className="mt-1 text-muted-foreground">
          Founder-only reconciliation. This reuses the verified FundedWealth account and does not change its financial records.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-5">
          <label className="block space-y-2 text-sm">
            <span>FundedWealth trading account ID</span>
            <Input
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                setPreview(null);
                setComplete(false);
                setConfirmation('');
              }}
              placeholder="Existing trading account UUID"
              disabled={busy || complete}
            />
          </label>
          <Button onClick={() => void submit('preview')} disabled={busy || !accountId.trim() || complete}>
            {busy ? 'Checking…' : 'Preview existing account'}
          </Button>
        </CardContent>
      </Card>
      {preview && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">Verified preflight</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Customer</dt><dd>{preview.customer.name} · {preview.customer.email}</dd></div>
              <div><dt className="text-muted-foreground">Account</dt><dd>{preview.account.accountCode}</dd></div>
              <div><dt className="text-muted-foreground">FundedWealth account ID</dt><dd className="break-all">{preview.account.id}</dd></div>
              <div><dt className="text-muted-foreground">Plan / challenge</dt><dd>{preview.account.plan} · {preview.account.challengeType}</dd></div>
              <div><dt className="text-muted-foreground">Account / challenge status</dt><dd>{preview.account.status} / {preview.account.challengeStatus}</dd></div>
              <div><dt className="text-muted-foreground">Starting / current balance</dt><dd>₹{preview.account.initialBalance.toLocaleString('en-IN')} / ₹{preview.account.currentBalance.toLocaleString('en-IN')}</dd></div>
              <div><dt className="text-muted-foreground">Provisioning record</dt><dd>{preview.provisioning.source} · {preview.provisioning.status} · {preview.provisioning.id}</dd></div>
              <div><dt className="text-muted-foreground">Challenge limits</dt><dd>Target {preview.account.rules.profitTargetPct}%, daily loss {preview.account.rules.dailyLossLimitPct}%, drawdown {preview.account.rules.maxDrawdownPct}%, min days {preview.account.rules.minTradingDays}</dd></div>
              <div><dt className="text-muted-foreground">Terminal rules</dt><dd>{preview.terminalRuleAction}</dd></div>
              <div><dt className="text-muted-foreground">Terminal identity</dt><dd>{preview.identityAction === 'reuse_existing_identity' ? 'Reuse existing identity' : 'Invite customer to existing email'}</dd></div>
              <div><dt className="text-muted-foreground">Account mapping</dt><dd>{preview.accountAction === 'already_linked' ? 'Already linked (no duplicate)' : 'Create one terminal-side mapping'}</dd></div>
            </dl>
            {preview.accountAction !== 'already_linked' && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Confirmation rechecks the source customer, account, active challenge, completed provisioning record, terminal identity, ownership, and matching rule version.
                </p>
                <label className="block space-y-2 text-sm">
                  <span>Type <strong>LINK {preview.account.accountCode}</strong> to confirm</span>
                  <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} />
                </label>
                <Button
                  onClick={() => void submit('confirm')}
                  disabled={busy || confirmation !== `LINK ${preview.account.accountCode}`}
                >
                  {busy ? 'Linking…' : 'Confirm link and invite if needed'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {message && (
        <p role="status" className={complete ? 'text-sm text-emerald-600' : 'text-sm text-destructive'}>
          {message}
        </p>
      )}
    </div>
  );
}
