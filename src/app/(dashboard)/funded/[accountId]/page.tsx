'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { LineChart } from '@/components/charts';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react';

interface FundedDetail {
  id: string;
  account_number: string;
  user_id: string;
  account_size: number;
  current_equity: number;
  profit_loss: number;
  profit_split_pct: number;
  daily_drawdown_limit_pct: number;
  max_drawdown_limit_pct: number;
  daily_drawdown_used_pct: number;
  max_drawdown_used_pct: number;
  violation_count: number;
  payout_eligible: boolean;
  ineligibility_reason: string | null;
  status: string;
  funded_at: string;
}

interface EligibilityCriteria {
  min_trading_days: boolean;
  profit_threshold: boolean;
  no_violations: boolean;
  kyc_verified: boolean;
}

export default function FundedDetailPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [account, setAccount] = useState<FundedDetail | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityCriteria | null>(null);
  const [equityCurve, setEquityCurve] = useState<{ date: string; equity: number }[]>([]);
  const [tradeStats, setTradeStats] = useState({ total: 0, winRate: 0, avgWin: 0, avgLoss: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => { fetchAccount(); }, [accountId]);

  async function fetchAccount() {
    setLoading(true);
    try {
      const res = await fetch(`/api/funded/${accountId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setAccount(json.data.account);
      setEligibility(json.data.eligibility);
      setEquityCurve(json.data.equityCurve || []);
      setTradeStats(json.data.tradeStats || { total: 0, winRate: 0, avgWin: 0, avgLoss: 0 });
    } catch { setError('Failed to load account details.'); }
    finally { setLoading(false); }
  }

  async function handleModify() {
    if (reason.length < 10) return;
    try {
      await fetch(`/api/funded/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      setActionModal(false);
      setReason('');
      fetchAccount();
    } catch { /* handle */ }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchAccount} />;
  if (!account) return <ErrorState message="Account not found" />;

  const traderShare = account.profit_loss > 0 ? account.profit_loss * (account.profit_split_pct / 100) : 0;
  const firmShare = account.profit_loss > 0 ? account.profit_loss - traderShare : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{account.account_number}</h1>
          <p className="text-muted-foreground">{formatCurrency(account.account_size)} Funded Account • {account.status}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActionModal(true)}>Modify Account</Button>
      </div>

      {/* Drawdown Alert */}
      {(account.daily_drawdown_used_pct > account.daily_drawdown_limit_pct || account.max_drawdown_used_pct > account.max_drawdown_limit_pct) && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <h3 className="font-semibold text-red-800 dark:text-red-400">⚠ Drawdown Breach Detected</h3>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">This account has exceeded configured drawdown limits.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Equity</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(account.current_equity)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Profit / Loss</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${account.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(account.profit_loss)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Trader Share ({account.profit_split_pct}%)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{formatCurrency(traderShare)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Firm Share ({100 - account.profit_split_pct}%)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(firmShare)}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Equity Curve */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Equity Curve</CardTitle></CardHeader>
          <CardContent>
            {equityCurve.length > 0 ? (
              <LineChart data={equityCurve} xKey="date" lines={[{ key: 'equity', color: 'hsl(222, 47%, 50%)', name: 'Equity' }]} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">No equity data available</div>
            )}
          </CardContent>
        </Card>

        {/* Eligibility & Trade Stats */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Payout Eligibility</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {eligibility ? (
                <>
                  <CriteriaRow label="Min Trading Days" met={eligibility.min_trading_days} />
                  <CriteriaRow label="Profit Threshold" met={eligibility.profit_threshold} />
                  <CriteriaRow label="No Active Violations" met={eligibility.no_violations} />
                  <CriteriaRow label="KYC Verified" met={eligibility.kyc_verified} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Eligibility data unavailable</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Trade Statistics</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Trades</span><span>{tradeStats.total}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Win Rate</span><span>{formatPercentage(tradeStats.winRate)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Avg Win</span><span className="text-green-600">{formatCurrency(tradeStats.avgWin)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Avg Loss</span><span className="text-red-600">{formatCurrency(tradeStats.avgLoss)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Drawdown Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Drawdown Compliance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <DrawdownBar label="Daily Drawdown" used={account.daily_drawdown_used_pct} limit={account.daily_drawdown_limit_pct} />
            <DrawdownBar label="Maximum Drawdown" used={account.max_drawdown_used_pct} limit={account.max_drawdown_limit_pct} />
          </div>
        </CardContent>
      </Card>

      {/* Modify Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setActionModal(false)} />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Modify Account</h3>
            <p className="text-sm text-muted-foreground">Provide a reason (minimum 10 characters). This action will be logged.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for modification..." className="w-full min-h-[80px] rounded border bg-background px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionModal(false)}>Cancel</Button>
              <Button onClick={handleModify} disabled={reason.length < 10}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CriteriaRow({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {met ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
      <span className={met ? '' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

function DrawdownBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const breached = used > limit;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={breached ? 'text-red-600 font-medium' : ''}>{formatPercentage(used)} / {formatPercentage(limit)}</span>
      </div>
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${breached ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
