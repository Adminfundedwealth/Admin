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
import { ExternalLink, RotateCcw } from 'lucide-react';

interface PaymentDetail {
  id: string;
  user_id: string;
  user_email: string;
  purchase_order_id: string;
  order_number: string;
  provider: string;
  provider_transaction_id: string | null;
  provider_payment_intent_id: string | null;
  amount: number;
  currency: string;
  fee: number;
  net_amount: number;
  status: string;
  failure_reason: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  payment_method_type: string | null;
  payment_method_last4: string | null;
  receipt_url: string | null;
  is_manual: boolean;
  manual_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function PaymentDetailPage() {
  const params = useParams();
  const paymentId = params.paymentId as string;
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refundModal, setRefundModal] = useState(false);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => { fetchPayment(); }, [paymentId]);

  async function fetchPayment() {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setPayment(json.data.payment);
      setTimeline(json.data.timeline || []);
    } catch {
      setError('Failed to load payment details.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund() {
    if (reason.length < 10) {
      setActionError('Reason must be at least 10 characters.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error?.message || 'Refund failed');
        return;
      }
      setRefundModal(false);
      setReason('');
      fetchPayment();
    } catch {
      setActionError('Refund failed.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchPayment} />;
  if (!payment) return <ErrorState message="Payment not found" />;

  const canRefund = payment.status === 'succeeded' && !payment.refund_amount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Details</h1>
          <p className="text-muted-foreground">
            {payment.provider} • {formatCurrency(payment.amount)} {payment.currency} • Order {payment.order_number}
          </p>
        </div>
        <div className="flex gap-2">
          {canRefund && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setRefundModal(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Refund
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Transaction Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Payment ID</span><span className="font-mono text-xs">{payment.id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="capitalize font-medium">{payment.provider}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Transaction ID</span><span className="font-mono text-xs">{payment.provider_transaction_id || '—'}</span></div>
            {payment.provider_payment_intent_id && (
              <div className="flex justify-between"><span className="text-muted-foreground">Payment Intent</span><span className="font-mono text-xs">{payment.provider_payment_intent_id}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{payment.status}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatCurrency(payment.amount)} {payment.currency}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Provider Fee</span><span>{formatCurrency(payment.fee)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Net Amount</span><span className="font-medium text-green-600">{formatCurrency(payment.net_amount)}</span></div>
            {payment.payment_method_type && (
              <div className="flex justify-between"><span className="text-muted-foreground">Payment Method</span><span>{payment.payment_method_type} •••• {payment.payment_method_last4}</span></div>
            )}
            {payment.receipt_url && (
              <div className="flex justify-between"><span className="text-muted-foreground">Receipt</span><a href={payment.receipt_url} target="_blank" rel="noopener" className="text-primary text-xs hover:underline">View Receipt ↗</a></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(payment.created_at).toLocaleString()}</span></div>
            {payment.is_manual && (
              <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
                <strong>Manual Payment</strong>{payment.manual_note && `: ${payment.manual_note}`}
              </div>
            )}
            {payment.failure_reason && (
              <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs"><strong>Failure:</strong> {payment.failure_reason}</div>
            )}
            {payment.refund_amount && (
              <div className="p-2 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs"><strong>Refunded:</strong> {formatCurrency(payment.refund_amount)} — {payment.refund_reason}</div>
            )}
          </CardContent>
        </Card>

        {/* Linked Records */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Purchase Order</CardTitle>
                <Link href={`/purchases/${payment.purchase_order_id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View Order <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Order #</span><span className="font-medium">{payment.order_number}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono text-xs">{payment.purchase_order_id}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Customer</CardTitle>
                <Link href={`/users/${payment.user_id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View Profile <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{payment.user_email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{payment.user_id}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Payment Timeline</CardTitle></CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No timeline events yet.</p>
          ) : (
            <Timeline events={timeline} />
          )}
        </CardContent>
      </Card>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setRefundModal(false); setReason(''); setActionError(''); }} />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Refund Payment</h3>
            <p className="text-sm text-muted-foreground">
              Refund {formatCurrency(payment.amount)} to the customer. This will trigger a refund via {payment.provider}.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Refund reason (minimum 10 characters)..."
              className="w-full min-h-[80px] rounded border bg-background px-3 py-2 text-sm"
            />
            {actionError && <div className="text-sm text-destructive">{actionError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRefundModal(false); setReason(''); setActionError(''); }}>Cancel</Button>
              <Button variant="destructive" onClick={handleRefund} disabled={actionLoading || reason.length < 10}>
                {actionLoading ? 'Processing...' : 'Confirm Refund'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
