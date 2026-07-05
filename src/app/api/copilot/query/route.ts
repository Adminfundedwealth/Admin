export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CopilotQueryRequest {
  query: string;
  context?: { previousMessages: unknown[] };
}

interface CopilotQueryResponse {
  type: 'data' | 'navigation' | 'report' | 'error';
  content: string;
  structuredData?: {
    type: 'metric' | 'table' | 'list' | 'summary';
    data: Record<string, unknown>;
  };
  entityRefs?: { id: string; type: string; label: string; href: string }[];
  navigation?: string;
}

// ---------------------------------------------------------------------------
// Intent Patterns
// ---------------------------------------------------------------------------

const navigationPatterns: Record<string, string> = {
  'payouts': '/payouts',
  'payout': '/payouts',
  'kyc': '/kyc',
  'risk': '/risk',
  'challenges': '/challenges',
  'funded': '/funded',
  'users': '/users',
  'traders': '/users',
  'tickets': '/support',
  'support': '/support',
  'trades': '/trades',
  'orders': '/orders',
  'revenue': '/revenue',
  'affiliates': '/affiliates',
  'marketing': '/marketing',
  'audit': '/audit',
  'staff': '/staff',
  'settings': '/settings',
  'monitoring': '/monitoring',
  'certificates': '/certificates',
  'executive': '/executive',
  'dashboard': '/executive',
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: CopilotQueryRequest = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedQuery = query.toLowerCase().trim();

    // --- Navigation intent ---
    if (isNavigationIntent(normalizedQuery)) {
      const response = handleNavigation(normalizedQuery);
      await logCopilotQuery(supabase, user.id, query, response.content);
      return NextResponse.json(response);
    }

    // --- Report generation intent ---
    if (isReportIntent(normalizedQuery)) {
      const response = await handleReport(supabase, normalizedQuery);
      await logCopilotQuery(supabase, user.id, query, response.content);
      return NextResponse.json(response);
    }

    // --- Data query intent ---
    const response = await handleDataQuery(supabase, normalizedQuery);
    await logCopilotQuery(supabase, user.id, query, response.content);
    return NextResponse.json(response);

  } catch (error) {
    console.error('[Copilot] Error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Try again.' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Intent Classification
// ---------------------------------------------------------------------------

function isNavigationIntent(query: string): boolean {
  const navPhrases = ['go to', 'navigate to', 'open', 'show me', 'take me to'];
  return navPhrases.some((phrase) => query.startsWith(phrase));
}

function isReportIntent(query: string): boolean {
  const reportPhrases = ['generate', 'report', 'summary', 'summarize', 'daily summary', 'founder report', 'risk report', 'support summary'];
  return reportPhrases.some((phrase) => query.includes(phrase));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleNavigation(query: string): CopilotQueryResponse {
  // Extract target from query
  const words = query.replace(/^(go to|navigate to|open|show me|take me to)\s*/i, '').trim();

  for (const [keyword, href] of Object.entries(navigationPatterns)) {
    if (words.includes(keyword)) {
      return {
        type: 'navigation',
        content: `Navigating to ${keyword}...`,
        navigation: href,
      };
    }
  }

  return {
    type: 'error',
    content: `I couldn't find a page matching "${words}". Try: payouts, KYC, risk, users, challenges, funded, support, trades, revenue.`,
  };
}

async function handleReport(supabase: any, query: string): Promise<CopilotQueryResponse> {
  try {
    // Fetch key metrics for report — LIVE TABLE CORRECTIONS
    const [payouts, kyc, risk, users] = await Promise.all([
      supabase.from('payout_reviews').select('*', { count: 'exact', head: true }).in('status', ['request_received', 'under_review']),
      supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('risk_events').select('*', { count: 'exact', head: true }).eq('acknowledged', false),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    ]);

    const content = [
      `📊 Daily Operations Summary`,
      ``,
      `• New registrations today: ${users.count ?? 0}`,
      `• Pending payouts: ${payouts.count ?? 0}`,
      `• Pending KYC reviews: ${kyc.count ?? 0}`,
      `• Active risk alerts: ${risk.count ?? 0}`,
    ].join('\n');

    return {
      type: 'report',
      content,
      structuredData: {
        type: 'summary',
        data: {
          title: 'Daily Operations Summary',
          content: `New registrations: ${users.count ?? 0}\nPending payouts: ${payouts.count ?? 0}\nPending KYC: ${kyc.count ?? 0}\nRisk alerts: ${risk.count ?? 0}`,
        },
      },
    };
  } catch {
    return {
      type: 'data',
      content: 'Unable to generate report. Some data sources may be unavailable.',
    };
  }
}

async function handleDataQuery(supabase: any, query: string): Promise<CopilotQueryResponse> {
  // --- Pending payouts --- LIVE TABLE: payout_reviews
  if (query.includes('pending payout') || query.includes('payout queue') || query.includes('how many') && query.includes('payout')) {
    const { count, data } = await supabase
      .from('payout_reviews')
      .select('id, calculated_payout, created_at', { count: 'exact' })
      .in('status', ['request_received', 'under_review'])
      .order('created_at', { ascending: true })
      .limit(5);

    return {
      type: 'data',
      content: `There are ${count ?? 0} pending payout requests.`,
      structuredData: {
        type: 'metric',
        data: { label: 'Pending Payouts', value: count ?? 0 },
      },
      entityRefs: (data ?? []).map((p: any) => ({
        id: p.id,
        type: 'payout',
        label: `Payout #${p.id.slice(0, 8)} — ₹${p.calculated_payout ?? 0}`,
        href: `/payouts/${p.id}`,
      })),
    };
  }

  // --- KYC queue ---
  if (query.includes('kyc') || query.includes('verification')) {
    const { count } = await supabase
      .from('kyc_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    return {
      type: 'data',
      content: `There are ${count ?? 0} pending KYC submissions awaiting review.`,
      structuredData: {
        type: 'metric',
        data: { label: 'Pending KYC', value: count ?? 0 },
      },
    };
  }

  // --- Risk events / high-risk accounts --- LIVE TABLE: risk_events
  if (query.includes('risk') || query.includes('breach') || query.includes('high-risk')) {
    const { count, data } = await supabase
      .from('risk_events')
      .select('id, severity, event_type, trading_account_id, created_at', { count: 'exact' })
      .eq('acknowledged', false)
      .order('severity', { ascending: false })
      .limit(5);

    return {
      type: 'data',
      content: `There are ${count ?? 0} active risk events.`,
      structuredData: {
        type: 'metric',
        data: { label: 'Active Risk Events', value: count ?? 0 },
      },
      entityRefs: (data ?? []).map((a: any) => ({
        id: a.id,
        type: 'risk_event',
        label: `${a.event_type} — ${a.severity}`,
        href: `/risk`,
      })),
    };
  }

  // --- Revenue ---
  if (query.includes('revenue')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('orders')
      .select('amount')
      .gte('created_at', today.toISOString())
      .eq('status', 'completed');

    const total = (data ?? []).reduce((sum: number, o: any) => sum + (o.amount ?? 0), 0);

    return {
      type: 'data',
      content: `Revenue today: ₹${total.toLocaleString()}`,
      structuredData: {
        type: 'metric',
        data: { label: 'Revenue Today', value: `₹${total.toLocaleString()}` },
      },
    };
  }

  // --- Registrations ---
  if (query.includes('registration') || query.includes('new user') || query.includes('sign up')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    return {
      type: 'data',
      content: `${count ?? 0} new users registered today.`,
      structuredData: {
        type: 'metric',
        data: { label: 'New Registrations Today', value: count ?? 0 },
      },
    };
  }

  // --- Funded accounts --- LIVE TABLE: challenge_accounts status=passed
  if (query.includes('funded') || query.includes('funded trader') || query.includes('funded account')) {
    const { count } = await supabase
      .from('challenge_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'passed');

    return {
      type: 'data',
      content: `There are ${count ?? 0} active funded accounts.`,
      structuredData: {
        type: 'metric',
        data: { label: 'Active Funded Accounts', value: count ?? 0 },
      },
    };
  }

  // --- Payout liability --- LIVE TABLE: payout_reviews
  if (query.includes('liability') || query.includes('total pending amount')) {
    const { data } = await supabase
      .from('payout_reviews')
      .select('calculated_payout')
      .in('status', ['request_received', 'under_review']);

    const total = (data ?? []).reduce((sum: number, p: any) => sum + (p.calculated_payout ?? 0), 0);

    return {
      type: 'data',
      content: `Total payout liability (pending): ₹${total.toLocaleString()}`,
      structuredData: {
        type: 'metric',
        data: { label: 'Payout Liability', value: `₹${total.toLocaleString()}` },
      },
    };
  }

  // --- Open tickets ---
  if (query.includes('ticket') || query.includes('support')) {
    const { count } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);

    return {
      type: 'data',
      content: `There are ${count ?? 0} open support tickets.`,
      structuredData: {
        type: 'metric',
        data: { label: 'Open Tickets', value: count ?? 0 },
      },
    };
  }

  // --- Staff online ---
  if (query.includes('staff') || query.includes('who is online') || query.includes('team')) {
    const { count } = await supabase
      .from('staff_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    return {
      type: 'data',
      content: `${count ?? 0} staff members are currently online.`,
      structuredData: {
        type: 'metric',
        data: { label: 'Staff Online', value: count ?? 0 },
      },
    };
  }

  // --- Fallback ---
  return {
    type: 'error',
    content: `I didn't understand that. Try:\n• "How many pending payouts?"\n• "Show KYC queue"\n• "Revenue today"\n• "Go to risk"\n• "Generate daily summary"`,
  };
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function logCopilotQuery(supabase: any, userId: string, query: string, response: string) {
  try {
    await supabase.from('audit_records').insert({
      actor_id: userId,
      actor_role: 'staff',
      action: 'copilot_query',
      target_type: 'copilot',
      target_id: null,
      previous_state: null,
      new_state: JSON.stringify({ query, response_preview: response.substring(0, 200) }),
    });
  } catch {
    // Non-critical — don't fail the request if audit logging fails
  }
}
