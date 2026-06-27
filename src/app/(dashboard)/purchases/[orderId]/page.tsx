'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timeline, type TimelineEvent } from '@/components/shared/timeline';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { formatCurrency } from '@/lib/utils';
import { ExternalLink, RotateCcw, XCircle } from 'lucide-react';

interface PurchaseOrderDetail {
  id: string;
  order_number: string;
  user_id: string;
  user_email: string;
  user_name: string;
  product_type: string;
  challenge_type: string | null;
  account_size: number | null;
  amount: number;
  currency: string;
  discount_code: string | null;
  discount_amount: number;
  final_amount: number;
  status: string;
  payment_id: string | null;
  challenge_account_id: string | null;
  refund_reason: string | null;
  refunded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface LinkedPayment {
  id: string;
  provider: string;
  provider_transaction_id: string | null;
  amount: number;
  status: string;
  payment_method_type: string | null;
  payment_method_last4: string | null;
  created_at: string;
}

interface LinkedAccount {
  id: string;
  account_number: string;
  challenge_type: string;
  phase: number;
  status: string;
  initial_balance: number;
  created_at: string;
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
  const [payment, setPayment] = useState<LinkedPayment | null>(null);
  const [account, setAccount] = useState<LinkedAccount | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState<'refund' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => { fetchOrder(); }, [orderId]);

  async function fetchOrder() {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchases/${orderId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setOrder(json.data.order);
      setPayment(json.data.payment || null);
      setAccount(json.data.account || null);
      setTimeline(json.data.timeline || []);
    } catch {
      setError('Failed to load purchase order details.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!actionModal || !order) return;
    if (reason.length < 10) {
      setActionError('Reason must be at least 10 characters.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/purchases/${orderId}/${actionModal}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error?.message || 'Action failed');
        return;
      }
      setActionModal(null);
      setReason('');
      fetchOrder();
    } catch {
      setActionError('Action failed.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchOrder} />;
  if (!order) return <ErrorState message="Purchase order not found" />;

  const canRefund = order.status === 'paid' && !order.refunded_at;
  const canCancel = order.status === 'pending';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order {order.order_number}</h1>
          <p className="text-muted-foreground">
            {order.user_email} • {formatCurrency(order.final_amount)} {order.currency}
          </p>
        </div>
        <div className="flex gap-2">
          {canRefund && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setActionModal('refund')}>
              <RotateCcw className="h-3.5 w-3.5" /> Refund
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActionModal('cancel')}>
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Order Flow Indicator */}
      <Card>
        <CardHeader><CardTitle className="text-base">Order Flow</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <FlowStep label="Order Created" active={true} complete={true} />
            <FlowArrow />
            <FlowStep label="Payment" active={!!payment} complete={payment?.status === 'succeeded'} failed={payment?.status === 'failed'} />
            <FlowArrow />
            <FlowStep label="Account Created" active={!!account} complete={!!account} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono text-xs">{order.id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Order Number</span><span className="font-medium">{order.order_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium capitalize">{order.status}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="capitalize">{order.product_type}</span></div>
            {order.challenge_type && <div className="flex justify-between"><span className="text-muted-foreground">Challenge Type</span><span>{order.challenge_type}</span></div>}
            {order.account_size && <div className="flex justify-between"><span className="text-muted-foreground">Account Size</span><span>{formatCurrency(order.account_size)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Original Amount</span><span>{formatCurrency(order.amount)}</span></div>
            {order.discount_code && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{order.discount_code} (-{formatCurrency(order.discount_amount)})</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Final Amount</span><span className="font-medium">{formatCurrency(order.final_amount)} {order.currency}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(order.created_at).toLocaleString()}</span></div>
            {order.refunded_at && <div className="flex justify-between"><span className="text-muted-foreground">Refunded</span><span className="text-red-600">{new Date(order.refunded_at).toLocaleString()}</span></div>}
            {order.refund_reason && <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs"><strong>Refund Reason:</strong> {order.refund_reason}</div>}
          </CardContent>
        </Card>

        {/* Customer */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Customer</CardTitle>
              <Link href={`/users/${order.user_id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                View Profile <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{order.user_id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{order.user_email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{order.user_name || '—'}</span></div>
          </CardContent>
        </Card>

        {/* Linked Payment */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Payment</CardTitle>
              {payment && (
                <Link href={`/payments/${payment.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View Payment <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {payment ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="capitalize">{payment.provider}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Transaction ID</span><span className="font-mono text-xs">{payment.provider_transaction_id || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatCurrency(payment.amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{payment.status}</span></div>
                {payment.payment_method_type && <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{payment.payment_method_type} •••• {payment.payment_method_last4}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{new Date(payment.created_at).toLocaleString()}</span></div>
              </>
            ) : (
              <p className="text-muted-foreground text-center py-4">No payment linked yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Linked Account */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Resulting Account</CardTitle>
              {account && (
                <Link href={`/challenges/${account.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View Account <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {account ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Account Number</span><span className="font-medium">{account.account_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Challenge Type</span><span>{account.challenge_type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Phase</span><span>{account.phase}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span>{formatCurrency(account.initial_balance)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{account.status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(account.created_at).toLocaleString()}</span></div>
              </>
            ) : (
              <p className="text-muted-foreground text-center py-4">No account created from this order yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Order Timeline</CardTitle></CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No timeline events yet.</p>
          ) : (
            <Timeline events={timeline} />
          )}
        </CardContent>
      </Card>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setActionModal(null); setReason(''); setActionError(''); }} />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold capitalize">{actionModal} Order</h3>
            <p className="text-sm text-muted-foreground">
              {actionModal === 'refund'
                ? `Refund ${formatCurrency(order.final_amount)} to the customer. This will be logged in the audit trail.`
                : 'Cancel this pending order. The customer will be notified.'}
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (minimum 10 characters)..."
              className="w-full min-h-[80px] rounded border bg-background px-3 py-2 text-sm"
            />
            {actionError && <div className="text-sm text-destructive">{actionError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setActionModal(null); setReason(''); setActionError(''); }}>Cancel</Button>
              <Button
                variant={actionModal === 'refund' ? 'destructive' : 'default'}
                onClick={handleAction}
                disabled={actionLoading || reason.length < 10}
              >
                {actionLoading ? 'Processing...' : `Confirm ${actionModal}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowStep({ label, active, complete, failed }: { label: string; active: boolean; complete: boolean; failed?: boolean }) {
  const bg = failed
    ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
    : complete
    ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
    : active
    ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'
    : 'bg-muted text-muted-foreground border-border';

  return (
    <div className={`px-3 py-1.5 rounded border text-xs font-medium ${bg}`}>
      {complete && '✓ '}{failed && '✗ '}{label}
    </div>
  );
}

function FlowArrow() {
  return <div className="w-6 h-0.5 bg-border" />;
}
