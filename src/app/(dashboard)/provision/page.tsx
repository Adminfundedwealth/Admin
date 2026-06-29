'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/shared/loading-state';
import { AlertTriangle, CheckCircle2, Search, UserPlus, Send, Shield } from 'lucide-react';

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
  created_at: string;
  can_provision: boolean;
}

interface ProvisionResult {
  order_id: string;
  user_email: string;
  user_name: string;
  challenge_account_id: string;
  login_id: string;
  account_size: number;
  plan: string;
  challenge_type: string;
  email_sent: boolean;
  provisioned_at: string;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  active: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  awaiting_payment: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

export default function ManualProvisionPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<OrderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderResult | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [provisionError, setProvisionError] = useState('');

  // Provision form state
  const [utrInput, setUtrInput] = useState('');
  const [challengeType, setChallengeType] = useState<'evaluation' | 'express' | 'stellar'>('evaluation');
  const [accountSizeInput, setAccountSizeInput] = useState('');
  const [planInput, setPlanInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  async function handleSearch() {
    if (!search || search.length < 3) {
      setError('Enter at least 3 characters (email or UTR reference)');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);
    setSelectedOrder(null);
    setProvisionResult(null);

    try {
      const res = await fetch(`/api/provision/manual?search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Search failed');
        return;
      }
      setResults(json.data || []);
      if (json.data?.length === 0) {
        setError('No orders found matching your search.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function selectOrder(order: OrderResult) {
    setSelectedOrder(order);
    setUtrInput(order.utr_reference || '');
    setAccountSizeInput(order.account_size ? String(order.account_size) : '');
    setPlanInput(order.plan_type || '');
    setProvisionResult(null);
    setProvisionError('');
  }

  async function handleProvision() {
    if (!selectedOrder) return;
    if (!utrInput.trim()) {
      setProvisionError('UTR reference is required for verification');
      return;
    }

    setProvisioning(true);
    setProvisionError('');
    setProvisionResult(null);

    try {
      const res = await fetch('/api/provision/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          utr_reference: utrInput.trim(),
          challenge_type: challengeType,
          account_size: accountSizeInput ? Number(accountSizeInput) : undefined,
          plan: planInput || undefined,
          notes: notesInput || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setProvisionError(json.error?.message || 'Provisioning failed');
        return;
      }

      setProvisionResult(json.data);
      // Remove provisioned order from results
      setResults(prev => prev.map(o =>
        o.id === selectedOrder.id ? { ...o, can_provision: false, provisioning_status: 'completed' } : o
      ));
    } catch {
      setProvisionError('Network error during provisioning. Check if the account was created.');
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-7 w-7" />
          Manual Provision
        </h1>
        <p className="text-muted-foreground mt-1">
          Manually provision trading accounts for verified paid users (pre-launch orders)
        </p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search Pending Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by email address or UTR reference..."
              className="flex-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {loading && <LoadingState rows={5} />}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders Found ({results.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2 pr-4">Plan</th>
                    <th className="pb-2 pr-4">UTR</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Provisioned</th>
                    <th className="pb-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{order.user_email}</div>
                        <div className="text-xs text-muted-foreground">{order.user_name}</div>
                      </td>
                      <td className="py-2.5 pr-4">₹{(order.amount || 0).toLocaleString()}</td>
                      <td className="py-2.5 pr-4">{order.plan_type || '—'}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{order.utr_reference || '—'}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-800'}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {order.provisioning_status ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.provisioning_status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {order.provisioning_status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not yet</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {order.can_provision ? (
                          <button
                            onClick={() => selectOrder(order)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                          >
                            Provision
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {order.provisioning_status === 'completed' ? '✓ Done' : 'N/A'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provision Form */}
      {selectedOrder && !provisionResult && (
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              Provision Account for {selectedOrder.user_email}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Order ID</label>
                <input
                  type="text"
                  value={selectedOrder.id}
                  disabled
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-muted font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">UTR Reference (verify)</label>
                <input
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="Enter UTR to verify payment"
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Challenge Type</label>
                <select
                  value={challengeType}
                  onChange={(e) => setChallengeType(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="evaluation">Evaluation</option>
                  <option value="express">Express</option>
                  <option value="stellar">Stellar</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Account Size (₹)</label>
                <input
                  type="number"
                  value={accountSizeInput}
                  onChange={(e) => setAccountSizeInput(e.target.value)}
                  placeholder={String(selectedOrder.account_size || 25000)}
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Plan Name</label>
                <input
                  type="text"
                  value={planInput}
                  onChange={(e) => setPlanInput(e.target.value)}
                  placeholder={selectedOrder.plan_type || 'e.g. standard, pro'}
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <input
                  type="text"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Internal notes..."
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {provisionError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {provisionError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleProvision}
                disabled={provisioning}
                className="px-5 py-2.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {provisioning ? (
                  <>Provisioning...</>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Approve &amp; Provision Account
                  </>
                )}
              </button>
              <button
                onClick={() => { setSelectedOrder(null); setProvisionError(''); }}
                className="px-4 py-2.5 border rounded-md text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Result */}
      {provisionResult && (
        <Card className="border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Account Provisioned Successfully
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">User:</span>{' '}
                <span className="font-medium">{provisionResult.user_name} ({provisionResult.user_email})</span>
              </div>
              <div>
                <span className="text-muted-foreground">Login ID:</span>{' '}
                <span className="font-mono font-bold">{provisionResult.login_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Account Size:</span>{' '}
                <span className="font-medium">₹{provisionResult.account_size.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Plan:</span>{' '}
                <span className="font-medium">{provisionResult.plan} ({provisionResult.challenge_type})</span>
              </div>
              <div>
                <span className="text-muted-foreground">Challenge Account:</span>{' '}
                <span className="font-mono text-xs">{provisionResult.challenge_account_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email Sent:</span>{' '}
                <span className={provisionResult.email_sent ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {provisionResult.email_sent ? '✓ Yes' : '✗ Failed (check Resend config)'}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => { setSelectedOrder(null); setProvisionResult(null); }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Provision Another
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
