'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { ExternalLink, Send, ArrowUp, CheckCircle, XCircle } from 'lucide-react';

interface TicketDetail {
  id: string;
  ticket_number: string;
  user_id: string;
  user_email: string;
  user_name: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  related_account_id: string | null;
  related_order_id: string | null;
  sla_breached: boolean;
  sla_deadline: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  sender_type: 'customer' | 'agent' | 'system';
  sender_name: string;
  body: string;
  is_internal_note: boolean;
  created_at: string;
}

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.ticketId as string;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [actionModal, setActionModal] = useState<string | null>(null);

  useEffect(() => { fetchTicket(); }, [ticketId]);

  async function fetchTicket() {
    setLoading(true);
    try {
      const res = await fetch(`/api/support/${ticketId}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setTicket(json.data.ticket);
      setMessages(json.data.messages || []);
    } catch {
      setError('Failed to load ticket details.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (replyBody.length < 5) return;
    setReplyLoading(true);
    try {
      const res = await fetch(`/api/support/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody, is_internal_note: isInternalNote }),
      });
      if (res.ok) {
        setReplyBody('');
        setIsInternalNote(false);
        fetchTicket();
      }
    } catch { /* handle */ }
    finally { setReplyLoading(false); }
  }

  async function handleStatusAction(action: string) {
    await fetch(`/api/support/${ticketId}/${action}`, { method: 'POST' });
    setActionModal(null);
    fetchTicket();
  }

  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchTicket} />;
  if (!ticket) return <ErrorState message="Ticket not found" />;

  const canResolve = ['open', 'in_progress', 'escalated'].includes(ticket.status);
  const canEscalate = ['open', 'in_progress'].includes(ticket.status);
  const canClose = ticket.status === 'resolved';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">#{ticket.ticket_number}</h1>
          <p className="text-muted-foreground">{ticket.subject}</p>
        </div>
        <div className="flex gap-2">
          {canEscalate && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleStatusAction('escalate')}>
              <ArrowUp className="h-3.5 w-3.5" /> Escalate
            </Button>
          )}
          {canResolve && (
            <Button size="sm" className="gap-1.5" onClick={() => handleStatusAction('resolve')}>
              <CheckCircle className="h-3.5 w-3.5" /> Resolve
            </Button>
          )}
          {canClose && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleStatusAction('close')}>
              <XCircle className="h-3.5 w-3.5" /> Close
            </Button>
          )}
        </div>
      </div>

      {/* SLA Warning */}
      {ticket.sla_breached && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <h3 className="font-semibold text-red-800 dark:text-red-400">⚠ SLA Breached</h3>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            {ticket.sla_deadline ? `Deadline was ${new Date(ticket.sla_deadline).toLocaleString()}` : 'Response time exceeded SLA threshold.'}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Ticket Meta */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Ticket Info</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{ticket.status.replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className="capitalize font-medium">{ticket.priority}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="capitalize">{ticket.category}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Assigned To</span><span>{ticket.assigned_agent_name || 'Unassigned'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(ticket.created_at).toLocaleString()}</span></div>
              {ticket.first_response_at && <div className="flex justify-between"><span className="text-muted-foreground">First Response</span><span>{new Date(ticket.first_response_at).toLocaleString()}</span></div>}
              {ticket.resolved_at && <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span>{new Date(ticket.resolved_at).toLocaleString()}</span></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Customer</CardTitle>
                <Link href={`/users/${ticket.user_id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  Profile <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{ticket.user_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{ticket.user_email}</span></div>
            </CardContent>
          </Card>

          {/* Linked Records */}
          <Card>
            <CardHeader><CardTitle className="text-base">Related Records</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {ticket.related_account_id ? (
                <Link href={`/challenges/${ticket.related_account_id}`} className="flex justify-between items-center hover:text-primary">
                  <span className="text-muted-foreground">Account</span>
                  <span className="flex items-center gap-1 text-xs font-mono">{ticket.related_account_id.slice(0, 8)}... <ExternalLink className="h-3 w-3" /></span>
                </Link>
              ) : (
                <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span>—</span></div>
              )}
              {ticket.related_order_id ? (
                <Link href={`/purchases/${ticket.related_order_id}`} className="flex justify-between items-center hover:text-primary">
                  <span className="text-muted-foreground">Order</span>
                  <span className="flex items-center gap-1 text-xs font-mono">{ticket.related_order_id.slice(0, 8)}... <ExternalLink className="h-3 w-3" /></span>
                </Link>
              ) : (
                <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span>—</span></div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Conversation */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="flex-1">
            <CardHeader><CardTitle className="text-base">Conversation</CardTitle></CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg text-sm ${
                        msg.is_internal_note
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                          : msg.sender_type === 'customer'
                          ? 'bg-muted'
                          : msg.sender_type === 'system'
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'bg-primary/5 border border-primary/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-xs">
                          {msg.sender_name}
                          {msg.is_internal_note && <span className="ml-1 text-yellow-700 dark:text-yellow-400">(internal note)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reply Form */}
          <Card>
            <CardContent className="pt-4">
              <form onSubmit={handleReply} className="space-y-3">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={isInternalNote ? 'Add internal note (not visible to customer)...' : 'Type your reply to the customer...'}
                  className="w-full min-h-[100px] rounded border bg-background px-3 py-2 text-sm resize-y"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded border"
                    />
                    <span className="text-muted-foreground">Internal note (not sent to customer)</span>
                  </label>
                  <Button type="submit" size="sm" className="gap-1.5" disabled={replyLoading || replyBody.length < 5}>
                    <Send className="h-3.5 w-3.5" /> {replyLoading ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
