'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timeline, type TimelineEvent } from '@/components/shared/timeline';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { Ban, Pause, MessageSquarePlus, ExternalLink, ShoppingCart, CreditCard, Trophy, TrendingUp, Wallet, Headphones, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  kyc_status: string;
  account_status: string;
  created_at: string;
  last_login_at: string | null;
  challenge_count: number;
  funded_count: number;
  payout_total: number;
  ticket_count: number;
  purchase_count: number;
  payment_count: number;
}

/** Relational records linked to this user */
interface UserPurchaseOrder {
  id: string;
  order_number: string;
  product_type: string;
  challenge_type: string | null;
  final_amount: number;
  status: string;
  created_at: string;
}

interface UserPayment {
  id: string;
  provider: string;
  amount: number;
  status: string;
  order_number: string;
  created_at: string;
}

interface UserChallengeAccount {
  id: string;
  account_number: string;
  challenge_type: string;
  phase: number;
  status: string;
  initial_balance: number;
  current_balance: number;
  created_at: string;
}

interface UserFundedAccount {
  id: string;
  account_number: string;
  account_size: number;
  current_equity: number;
  status: string;
  funded_at: string;
}

interface UserPayout {
  id: string;
  requested_amount: number;
  calculated_payout: number;
  status: string;
  created_at: string;
}

interface UserTicket {
  id: string;
  ticket_number: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
}

interface UserNote {
  id: string;
  category: string;
  body: string;
  author_name: string;
  created_at: string;
}

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [purchases, setPurchases] = useState<UserPurchaseOrder[]>([]);
  const [payments, setPayments] = useState<UserPayment[]>([]);
  const [challenges, setChallenges] = useState<UserChallengeAccount[]>([]);
  const [fundedAccounts, setFundedAccounts] = useState<UserFundedAccount[]>([]);
  const [payouts, setPayouts] = useState<UserPayout[]>([]);
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'payments' | 'accounts' | 'payouts' | 'support' | 'timeline'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState('general');
  const [actionReason, setActionReason] = useState('');
  const [showActionModal, setShowActionModal] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  async function fetchProfile() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      const json = await res.json();
      setProfile(json.data.profile);
      setTimeline(json.data.timeline || []);
      setNotes(json.data.notes || []);
      setPurchases(json.data.purchases || []);
      setPayments(json.data.payments || []);
      setChallenges(json.data.challenges || []);
      setFundedAccounts(json.data.fundedAccounts || []);
      setPayouts(json.data.payouts || []);
      setTickets(json.data.tickets || []);
    } catch {
      setError('Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (noteBody.length < 10 || noteBody.length > 5000) return;

    try {
      const res = await fetch(`/api/users/${userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody, category: noteCategory }),
      });
      if (res.ok) {
        setNoteBody('');
        setShowNoteForm(false);
        fetchProfile(); // Refresh
      }
    } catch {
      // Handle error
    }
  }

  async function handleUserAction(action: string) {
    if (actionReason.length < 10) return;

    try {
      await fetch(`/api/users/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason }),
      });
      setShowActionModal(null);
      setActionReason('');
      fetchProfile();
    } catch {
      // Handle error
    }
  }

  if (loading) return <LoadingState rows={8} />;
  if (error) return <ErrorState message={error} onRetry={fetchProfile} />;
  if (!profile) return <ErrorState message="User not found" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {profile.first_name} {profile.last_name}
          </h1>
          <p className="text-muted-foreground">{profile.email}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowActionModal('suspend')}>
            <Pause className="h-3.5 w-3.5" /> Suspend
          </Button>
          <Button variant="destructive" size="sm" className="gap-2" onClick={() => setShowActionModal('ban')}>
            <Ban className="h-3.5 w-3.5" /> Ban
          </Button>
        </div>
      </div>

      {/* Profile Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Profile Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span>{profile.username || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{profile.phone || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Country</span><span>{profile.country || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Registered</span><span>{new Date(profile.created_at).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Login</span><span>{profile.last_login_at ? new Date(profile.last_login_at).toLocaleString() : 'Never'}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">KYC</span><span className="font-medium capitalize">{profile.kyc_status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-medium capitalize">{profile.account_status}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Purchase Orders</span><span>{profile.purchase_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payments</span><span>{profile.payment_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Challenges</span><span>{profile.challenge_count}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Funded Accounts</span><span>{profile.funded_count}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Payouts</span><span>{formatCurrency(profile.payout_total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Support Tickets</span><span>{profile.ticket_count}</span></div>
            </CardContent>
          </Card>
        </div>

        {/* Center + Right — Tabbed Relational Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab Navigation */}
          <div className="flex gap-1 border-b overflow-x-auto">
            {([
              { id: 'overview', label: 'Overview', icon: MessageSquarePlus },
              { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
              { id: 'payments', label: 'Payments', icon: CreditCard },
              { id: 'accounts', label: 'Accounts', icon: Trophy },
              { id: 'payouts', label: 'Payouts', icon: Wallet },
              { id: 'support', label: 'Support', icon: Headphones },
              { id: 'timeline', label: 'Timeline', icon: ShieldCheck },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content: Overview (Notes) */}
          {activeTab === 'overview' && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Internal Notes</CardTitle>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowNoteForm(!showNoteForm)}>
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Add Note
                  </Button>
                </CardHeader>
                <CardContent>
                  {showNoteForm && (
                    <form onSubmit={handleAddNote} className="space-y-3 mb-4 p-3 rounded border bg-muted/30">
                      <select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)} className="h-8 rounded border bg-background px-2 text-sm w-full">
                        <option value="general">General</option>
                        <option value="compliance">Compliance</option>
                        <option value="support">Support</option>
                        <option value="risk">Risk</option>
                        <option value="finance">Finance</option>
                      </select>
                      <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add internal note (10-5000 characters)..." className="w-full min-h-[80px] rounded border bg-background px-3 py-2 text-sm resize-y" minLength={10} maxLength={5000} />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{noteBody.length}/5000</span>
                        <Button type="submit" size="sm" disabled={noteBody.length < 10}>Save Note</Button>
                      </div>
                    </form>
                  )}
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No internal notes yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div key={note.id} className="p-3 rounded border text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{note.author_name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{note.category}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-muted-foreground whitespace-pre-wrap">{note.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Tab Content: Purchase Orders */}
          {activeTab === 'purchases' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Purchase Orders</CardTitle></CardHeader>
              <CardContent>
                {purchases.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No purchase orders found.</p>
                ) : (
                  <div className="space-y-2">
                    {purchases.map((order) => (
                      <Link key={order.id} href={`/purchases/${order.id}`} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
                        <div>
                          <span className="font-medium text-sm">{order.order_number}</span>
                          <span className="text-xs text-muted-foreground ml-2 capitalize">{order.challenge_type || order.product_type}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-medium">{formatCurrency(order.final_amount)}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${order.status === 'paid' ? 'bg-green-100 text-green-800' : order.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{order.status}</span>
                          <span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab Content: Payments */}
          {activeTab === 'payments' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No payments found.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((pmt) => (
                      <Link key={pmt.id} href={`/payments/${pmt.id}`} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
                        <div>
                          <span className="font-medium text-sm capitalize">{pmt.provider}</span>
                          <span className="text-xs text-muted-foreground ml-2">Order {pmt.order_number}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-medium">{formatCurrency(pmt.amount)}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${pmt.status === 'succeeded' ? 'bg-green-100 text-green-800' : pmt.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{pmt.status}</span>
                          <span className="text-xs text-muted-foreground">{new Date(pmt.created_at).toLocaleDateString()}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab Content: Accounts (Challenges + Funded) */}
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Challenge Accounts</CardTitle></CardHeader>
                <CardContent>
                  {challenges.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No challenge accounts.</p>
                  ) : (
                    <div className="space-y-2">
                      {challenges.map((acc) => (
                        <Link key={acc.id} href={`/challenges/${acc.id}`} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
                          <div>
                            <span className="font-medium text-sm">{acc.account_number}</span>
                            <span className="text-xs text-muted-foreground ml-2">{acc.challenge_type} • Phase {acc.phase}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span>{formatCurrency(acc.current_balance)} / {formatCurrency(acc.initial_balance)}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${acc.status === 'active' ? 'bg-blue-100 text-blue-800' : acc.status === 'passed' ? 'bg-green-100 text-green-800' : acc.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{acc.status}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Funded Accounts</CardTitle></CardHeader>
                <CardContent>
                  {fundedAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No funded accounts.</p>
                  ) : (
                    <div className="space-y-2">
                      {fundedAccounts.map((acc) => (
                        <Link key={acc.id} href={`/funded/${acc.id}`} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
                          <div>
                            <span className="font-medium text-sm">{acc.account_number}</span>
                            <span className="text-xs text-muted-foreground ml-2">{formatCurrency(acc.account_size)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className={acc.current_equity >= acc.account_size ? 'text-green-600' : 'text-red-600'}>{formatCurrency(acc.current_equity)}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${acc.status === 'active' ? 'bg-green-100 text-green-800' : acc.status === 'breached' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{acc.status}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab Content: Payouts */}
          {activeTab === 'payouts' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Payout History</CardTitle></CardHeader>
              <CardContent>
                {payouts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No payout requests.</p>
                ) : (
                  <div className="space-y-2">
                    {payouts.map((p) => (
                      <Link key={p.id} href={`/payouts/${p.id}`} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
                        <div>
                          <span className="font-medium text-sm">{formatCurrency(p.requested_amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">→ {formatCurrency(p.calculated_payout)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${p.status === 'payment_completed' ? 'bg-green-100 text-green-800' : p.status === 'payment_failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{p.status.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab Content: Support */}
          {activeTab === 'support' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Support Tickets</CardTitle></CardHeader>
              <CardContent>
                {tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No support tickets.</p>
                ) : (
                  <div className="space-y-2">
                    {tickets.map((t) => (
                      <Link key={t.id} href={`/support/${t.id}`} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
                        <div>
                          <span className="font-medium text-sm">#{t.ticket_number}</span>
                          <span className="text-xs text-muted-foreground ml-2">{t.subject}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${t.priority === 'critical' ? 'bg-red-100 text-red-800' : t.priority === 'high' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>{t.priority}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${t.status === 'open' ? 'bg-blue-100 text-blue-800' : t.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{t.status.replace(/_/g, ' ')}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab Content: Timeline */}
          {activeTab === 'timeline' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Event Timeline</CardTitle></CardHeader>
              <CardContent>
                <Timeline events={timeline} hasMore={timeline.length >= 50} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowActionModal(null)} />
          <div className="relative bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold capitalize">{showActionModal} User</h3>
            <p className="text-sm text-muted-foreground">
              Please provide a reason for this action (minimum 10 characters).
            </p>
            <textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Reason for action..."
              className="w-full min-h-[80px] rounded border bg-background px-3 py-2 text-sm"
              minLength={10}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowActionModal(null)}>Cancel</Button>
              <Button
                variant={showActionModal === 'ban' ? 'destructive' : 'default'}
                onClick={() => handleUserAction(showActionModal)}
                disabled={actionReason.length < 10}
              >
                Confirm {showActionModal}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
