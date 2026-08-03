'use client';
import { apiFetch } from '@/lib/api/fetch';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/shared/loading-state';
import {
  AlertTriangle, CheckCircle2, Search, UserPlus, Send, Shield,
  Eye, Copy, Mail, X, Loader2, XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderResult {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  amount: number;
  account_size: number | null;
  plan_type: string | null;
  status: string;
  payment_method: string | null;
  utr_reference: string | null;
  provisioning_status: string | null;
  provisioned_at: string | null;
  challenge_account_id: string | null;
  trading_account_id: string | null;
  provisioned_plan: string | null;
  provisioned_account_size: number | null;
  provisioned_challenge_type: string | null;
  provisioned_account_status: string | null;
  created_at: string;
  can_provision: boolean;
}

interface ProvisionResult {
  order_id: string;
  user_email: string;
  user_name: string;
  challenge_account_id: string;
  login_id: string;
  password: string;
  account_size: number;
  plan: string;
  challenge_type: string;
  email_sent: boolean;
  provisioned_at: string;
}

interface Notification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ProvisionedOrderDetails {
  order_id: string;
  user_email: string;
  user_name: string;
  challenge_account_id: string | null;
  trading_account_id: string | null;
  provisioning_status: string;
  plan: string | null;
  account_size: number | null;
  challenge_type: string | null;
  status: string | null;
  provisioned_at: string | null;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  awaiting_payment: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const provStatusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManualProvisionPage() {
  // Search state
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<OrderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // View detail state
  const [viewOrder, setViewOrder] = useState<OrderResult | null>(null);

  // Confirmation modal state
  const [modalOrder, setModalOrder] = useState<OrderResult | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState('');

  // Provision form fields
  const [utrInput, setUtrInput] = useState('');
  const [challengeType, setChallengeType] = useState<'flash' | 'instant' | '1-step' | '2-step'>('flash');
  const [accountSizeInput, setAccountSizeInput] = useState('');
  const [planInput, setPlanInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  // Result state
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [resending, setResending] = useState(false);
  const [viewProvisionedOrder, setViewProvisionedOrder] = useState<ProvisionedOrderDetails | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  let notifId = 0;

  const addNotification = useCallback((type: Notification['type'], message: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // ─── Search Handler ─────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!search || search.length < 3) {
      setSearchError('Enter at least 3 characters (email, order ID, or UTR reference)');
      return;
    }
    setLoading(true);
    setSearchError('');
    setResults([]);
    setViewOrder(null);
    setProvisionResult(null);

    try {
      const res = await apiFetch(`/api/provision/manual?search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (!res.ok) {
        setSearchError(json.error?.message || 'Search failed');
        return;
      }
      setResults(json.data || []);
      if (json.data?.length === 0) {
        setSearchError('No orders found matching your search.');
      }
    } catch {
      setSearchError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Open Provision Modal ───────────────────────────────────────────────────

  function openProvisionModal(order: OrderResult) {
    setModalOrder(order);
    setUtrInput(order.utr_reference || '');
    setAccountSizeInput(order.account_size ? String(order.account_size) : '25000');
    setPlanInput(order.plan_type || '');
    setChallengeType('flash');
    setNotesInput('');
    setProvisionError('');
  }

  function closeModal() {
    setModalOrder(null);
    setProvisionError('');
  }

  // ─── Provision Handler ──────────────────────────────────────────────────────

  async function handleProvision() {
    if (!modalOrder) return;
    if (!utrInput.trim()) {
      setProvisionError('UTR reference is required for verification');
      return;
    }
    if (!accountSizeInput || Number(accountSizeInput) <= 0) {
      setProvisionError('Account Size is required');
      return;
    }

    setProvisioning(true);
    setProvisionError('');

    try {
      const res = await apiFetch('/api/provision/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: modalOrder.id,
          utr_reference: utrInput.trim(),
          challenge_type: challengeType,
          account_size: Number(accountSizeInput),
          plan: planInput || undefined,
          notes: notesInput || undefined,
        }),
      });

      const json = await res.json();

      // Handle already-provisioned response — show existing details
      if (json.already_provisioned) {
        setModalOrder(null);
        setViewProvisionedOrder(json.data);
        addNotification('info', `Order already provisioned. Showing existing account details.`);
        return;
      }

      if (!res.ok) {
        setProvisionError(json.error?.message || 'Provisioning failed');
        addNotification('error', json.error?.message || 'Provisioning failed');
        return;
      }

      setProvisionResult(json.data);
      setModalOrder(null);
      // Update results table to reflect provisioning
      setResults(prev => prev.map(o =>
        o.id === modalOrder.id
          ? { ...o, can_provision: false, provisioning_status: 'completed' }
          : o
      ));
      addNotification('success', `Account provisioned for ${json.data.user_email}. Login: ${json.data.login_id}`);
    } catch {
      setProvisionError('Network error. Check if account was created before retrying.');
      addNotification('error', 'Network error during provisioning');
    } finally {
      setProvisioning(false);
    }
  }

  // ─── Copy Credentials ──────────────────────────────────────────────────────

  function copyCredentials() {
    if (!provisionResult) return;
    const text = `FundedWealth Trading Account Credentials
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Login ID: ${provisionResult.login_id}
Password: ${provisionResult.password}
Account Size: ₹${provisionResult.account_size.toLocaleString()}
Plan: ${provisionResult.plan} (${provisionResult.challenge_type})
Terminal: https://terminal.fundedwealth.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Please change your password after first login.`;

    navigator.clipboard.writeText(text).then(() => {
      addNotification('success', 'Credentials copied to clipboard');
    }).catch(() => {
      addNotification('error', 'Failed to copy. Please select and copy manually.');
    });
  }

  // ─── Resend Email ──────────────────────────────────────────────────────────

  async function handleResendEmail() {
    if (!provisionResult) return;
    setResending(true);
    try {
      const res = await apiFetch('/api/provision/manual/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: provisionResult.user_email,
          user_name: provisionResult.user_name,
          login_id: provisionResult.login_id,
          password: provisionResult.password,
          account_size: provisionResult.account_size,
          plan: provisionResult.plan,
          challenge_type: provisionResult.challenge_type,
        }),
      });
      const json = await res.json();
      if (json.success) {
        addNotification('success', `Credentials email resent to ${provisionResult.user_email}`);
      } else {
        addNotification('error', json.error?.message || 'Failed to resend email');
      }
    } catch {
      addNotification('error', 'Network error while resending email');
    } finally {
      setResending(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 relative">
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-2 p-3 rounded-lg shadow-lg text-sm border ${
                n.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300'
                  : n.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300'
                  : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300'
              }`}
            >
              {n.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
              {n.type === 'error' && <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span className="flex-1">{n.message}</span>
              <button onClick={() => removeNotification(n.id)} className="shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-7 w-7" />
          Manual Provision
        </h1>
        <p className="text-muted-foreground mt-1">
          Provision trading accounts for verified paid users. Search by email, order ID, or UTR — all paid orders shown regardless of purchase date.
        </p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search by Email, Order ID, or UTR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter trader email, order ID, or UTR reference..."
              className="flex-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Search by email, order ID, or UTR"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {searchError && (
            <p className="mt-3 text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {searchError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <LoadingState rows={5} />}

      {/* Results Table */}
      {results.length > 0 && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Matching Orders ({results.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="pb-3 pr-3 font-medium">Name</th>
                    <th className="pb-3 pr-3 font-medium">Email</th>
                    <th className="pb-3 pr-3 font-medium">Order ID</th>
                    <th className="pb-3 pr-3 font-medium">Challenge</th>
                    <th className="pb-3 pr-3 font-medium">Account Size</th>
                    <th className="pb-3 pr-3 font-medium">Payment Status</th>
                    <th className="pb-3 pr-3 font-medium">UTR</th>
                    <th className="pb-3 pr-3 font-medium">Provision Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-3 pr-3 font-medium">
                        {order.user_name || '—'}
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        {order.user_email}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">
                        {order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3 pr-3">
                        {order.plan_type || '—'}
                      </td>
                      <td className="py-3 pr-3">
                        {order.account_size ? `₹${order.account_size.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-800'}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs max-w-[120px] truncate" title={order.utr_reference || ''}>
                        {order.utr_reference || '—'}
                      </td>
                      <td className="py-3 pr-3">
                        {order.provisioning_status ? (
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${provStatusColors[order.provisioning_status] || 'bg-gray-100 text-gray-800'}`}>
                            {order.provisioning_status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not provisioned</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setViewOrder(order)}
                            className="px-2.5 py-1 border rounded text-xs font-medium hover:bg-accent flex items-center gap-1"
                            title="View order details"
                          >
                            <Eye className="h-3 w-3" /> View
                          </button>
                          {order.can_provision && (
                            <button
                              onClick={() => openProvisionModal(order)}
                              className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 flex items-center gap-1"
                              title="Provision trading account"
                            >
                              <UserPlus className="h-3 w-3" /> Provision
                            </button>
                          )}
                          {order.provisioning_status === 'completed' && (
                            <button
                              onClick={() => setViewProvisionedOrder({
                                order_id: order.id,
                                user_email: order.user_email,
                                user_name: order.user_name,
                                challenge_account_id: order.challenge_account_id,
                                trading_account_id: order.trading_account_id,
                                provisioning_status: order.provisioning_status!,
                                plan: order.provisioned_plan,
                                account_size: order.provisioned_account_size,
                                challenge_type: order.provisioned_challenge_type,
                                status: order.provisioned_account_status,
                                provisioned_at: order.provisioned_at,
                              })}
                              className="px-2.5 py-1 border border-green-300 text-green-700 rounded text-xs font-medium hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30 flex items-center gap-1"
                              title="View provisioned account details"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Account
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Order Detail Panel */}
      {viewOrder && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600" />
              Order Details
            </CardTitle>
            <button onClick={() => setViewOrder(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Name</span>
                <span className="font-medium">{viewOrder.user_name || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Email</span>
                <span className="font-medium">{viewOrder.user_email}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Order ID</span>
                <span className="font-mono text-xs">{viewOrder.id}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Amount</span>
                <span className="font-medium">₹{(viewOrder.amount ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Account Size</span>
                <span className="font-medium">{viewOrder.account_size ? `₹${viewOrder.account_size.toLocaleString()}` : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Plan Type</span>
                <span className="font-medium">{viewOrder.plan_type || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Payment Method</span>
                <span className="font-medium">{viewOrder.payment_method || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">UTR Reference</span>
                <span className="font-mono text-xs">{viewOrder.utr_reference || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Payment Status</span>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[viewOrder.status] || 'bg-gray-100 text-gray-800'}`}>
                  {viewOrder.status}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Provision Status</span>
                {viewOrder.provisioning_status ? (
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${provStatusColors[viewOrder.provisioning_status] || 'bg-gray-100 text-gray-800'}`}>
                    {viewOrder.provisioning_status}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">Not yet</span>
                )}
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Order Date</span>
                <span className="font-medium">{new Date(viewOrder.created_at).toLocaleString()}</span>
              </div>
            </div>
            {viewOrder.can_provision && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => { setViewOrder(null); openProvisionModal(viewOrder); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" /> Provision This Account
                </button>
              </div>
            )}
            {viewOrder.provisioning_status === 'completed' && (
              <div className="mt-4 pt-4 border-t">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">Challenge Account ID</span>
                    <span className="font-mono text-xs">{viewOrder.challenge_account_id || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Provisioned Plan</span>
                    <span className="font-medium">{viewOrder.provisioned_plan || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Provisioned Size</span>
                    <span className="font-medium">{viewOrder.provisioned_account_size ? `₹${viewOrder.provisioned_account_size.toLocaleString()}` : '—'}</span>
                  </div>
                </div>
                <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Already provisioned{viewOrder.provisioned_at ? ` on ${new Date(viewOrder.provisioned_at).toLocaleString()}` : ''}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing Provisioned Account Details */}
      {viewProvisionedOrder && (
        <Card className="border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Existing Provisioned Account
            </CardTitle>
            <button onClick={() => setViewProvisionedOrder(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="bg-white dark:bg-gray-900 border rounded-lg p-4 space-y-3">
              <p className="text-sm text-muted-foreground">This order has already been provisioned. No duplicate account will be created.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">User</span>
                  <span className="font-medium">{viewProvisionedOrder.user_name}</span>
                  <span className="text-xs text-muted-foreground ml-1">({viewProvisionedOrder.user_email})</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Order ID</span>
                  <span className="font-mono text-xs">{viewProvisionedOrder.order_id}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Challenge Account ID</span>
                  <span className="font-mono text-xs">{viewProvisionedOrder.challenge_account_id || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Trading Account ID</span>
                  <span className="font-mono text-xs">{viewProvisionedOrder.trading_account_id || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Plan</span>
                  <span className="font-medium">{viewProvisionedOrder.plan || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Account Size</span>
                  <span className="font-medium">{viewProvisionedOrder.account_size ? `₹${viewProvisionedOrder.account_size.toLocaleString()}` : '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Challenge Type</span>
                  <span className="font-medium">{viewProvisionedOrder.challenge_type || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Account Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    viewProvisionedOrder.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {viewProvisionedOrder.status || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Provisioning Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${provStatusColors[viewProvisionedOrder.provisioning_status] || 'bg-gray-100 text-gray-800'}`}>
                    {viewProvisionedOrder.provisioning_status}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Provisioned At</span>
                  <span className="font-medium">{viewProvisionedOrder.provisioned_at ? new Date(viewProvisionedOrder.provisioned_at).toLocaleString() : '—'}</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={() => setViewProvisionedOrder(null)}
                className="px-4 py-2 border rounded-md text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Close
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provisioned Credentials Display */}
      {provisionResult && (
        <Card className="border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Account Provisioned Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Credentials Box */}
            <div className="bg-white dark:bg-gray-900 border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">Generated Credentials</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Login ID</span>
                  <span className="font-mono font-bold text-lg">{provisionResult.login_id}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Password</span>
                  <span className="font-mono font-bold text-lg">{provisionResult.password}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm pt-2 border-t">
                <div>
                  <span className="text-xs text-muted-foreground block">User</span>
                  <span className="font-medium">{provisionResult.user_name}</span>
                  <span className="text-xs text-muted-foreground ml-1">({provisionResult.user_email})</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Account Size</span>
                  <span className="font-medium">₹{provisionResult.account_size.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Plan</span>
                  <span className="font-medium">{provisionResult.plan} ({provisionResult.challenge_type})</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Challenge Account ID</span>
                  <span className="font-mono text-xs">{provisionResult.challenge_account_id}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Email Status</span>
                  <span className={provisionResult.email_sent ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                    {provisionResult.email_sent ? '✓ Sent successfully' : '✗ Failed — use Resend button'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Provisioned At</span>
                  <span className="font-medium">{new Date(provisionResult.provisioned_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={copyCredentials}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
              >
                <Copy className="h-4 w-4" /> Copy Credentials
              </button>
              <button
                onClick={handleResendEmail}
                disabled={resending}
                className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-accent flex items-center gap-2 disabled:opacity-50"
              >
                {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {resending ? 'Sending...' : 'Resend Email'}
              </button>
              <button
                onClick={() => { setProvisionResult(null); }}
                className="px-4 py-2 border rounded-md text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Provision Another
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal */}
      {modalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          {/* Modal */}
          <div className="relative bg-background border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Modal Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  Provision Account
                </h2>
                <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Target User Info */}
              <div className="bg-accent/30 rounded-lg p-3 text-sm">
                <div className="font-medium">{modalOrder.user_name || modalOrder.user_email}</div>
                <div className="text-xs text-muted-foreground">{modalOrder.user_email} · Order {modalOrder.id.slice(0, 8).toUpperCase()}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Amount: ₹{(modalOrder.amount ?? 0).toLocaleString()} · Status: {modalOrder.status}
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">UTR Reference *</label>
                  <input
                    type="text"
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value)}
                    placeholder="Enter UTR to verify payment"
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Must match the UTR on the order record</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Challenge Type</label>
                    <select
                      value={challengeType}
                      onChange={(e) => setChallengeType(e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="flash">Flash</option>
                      <option value="instant">Instant</option>
                      <option value="1-step">1-Step</option>
                      <option value="2-step">2-Step</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Account Size (₹) *</label>
                    <input
                      type="number"
                      value={accountSizeInput}
                      onChange={(e) => setAccountSizeInput(e.target.value)}
                      placeholder="e.g. 25000, 50000, 100000"
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Plan Name</label>
                  <input
                    type="text"
                    value={planInput}
                    onChange={(e) => setPlanInput(e.target.value)}
                    placeholder={modalOrder.plan_type || 'e.g. standard, pro, elite'}
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Internal Notes (optional)</label>
                  <input
                    type="text"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Any notes for the audit log..."
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* What will happen */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">This action will:</p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
                  <li>Generate a Login ID and Password</li>
                  <li>Create a challenge_accounts record</li>
                  <li>Create a provisioning_logs entry</li>
                  <li>Update order status to active</li>
                  <li>Send credentials email to trader</li>
                  <li>Write an audit log entry</li>
                </ul>
              </div>

              {/* Error */}
              {provisionError && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-red-700 dark:text-red-400">{provisionError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="flex-1 px-5 py-2.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {provisioning ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Provisioning...</>
                  ) : (
                    <><Send className="h-4 w-4" /> Confirm &amp; Provision</>
                  )}
                </button>
                <button
                  onClick={closeModal}
                  disabled={provisioning}
                  className="px-4 py-2.5 border rounded-md text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
