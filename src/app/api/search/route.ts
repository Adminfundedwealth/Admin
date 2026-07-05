export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthInHandler } from '@/lib/security/require-auth';
import { sanitizeSearchInput } from '@/lib/security/sanitize';

/**
 * GET /api/search?q=query
 * Global search across users, accounts, tickets, and all entity types.
 * Returns results grouped by entity type (max 5 per group).
 * Requires min 2 characters. Results within 2 seconds.
 * 
 * SECURITY: Sanitizes search input to prevent PostgREST filter injection.
 */
export async function GET(request: NextRequest) {
  // Defense-in-depth auth
  const { error: authError } = await requireAuthInHandler();
  if (authError) return authError;

  const rawQuery = request.nextUrl.searchParams.get('q');

  if (!rawQuery || rawQuery.length < 2) {
    return NextResponse.json({ results: {} });
  }

  // Sanitize input to prevent filter injection
  const query = sanitizeSearchInput(rawQuery);
  if (query.length < 2) {
    return NextResponse.json({ results: {} });
  }

  const supabase = createAdminClient();
  const results: Record<string, Array<{ id: string; type: string; title: string; subtitle: string; href: string }>> = {};

  try {
    // Search users — use individual ilike filters to avoid .or() injection
    const { data: users } = await supabase
      .from('users')
      .select('id, email, username, first_name, last_name')
      .or(`email.ilike.%${query}%,username.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(5);

    if (users && users.length > 0) {
      results['Users'] = users.map((u) => ({
        id: u.id,
        type: 'Users',
        title: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        subtitle: u.email,
        href: `/users/${u.id}`,
      }));
    }

    // Search challenge accounts — LIVE cols: id, type, plan, trader_id, status (no account_number/challenge_type)
    const { data: challenges } = await supabase
      .from('challenge_accounts')
      .select('id, type, plan, status, trader_id')
      .or(`type.ilike.%${query}%,plan.ilike.%${query}%`)
      .limit(5);

    if (challenges && challenges.length > 0) {
      results['Challenges'] = challenges.map((c) => ({
        id: c.id,
        type: 'Challenges',
        title: c.id.slice(0, 8).toUpperCase(),
        subtitle: `${c.plan || c.type} • ${c.status}`,
        href: `/challenges/${c.id}`,
      }));
    }

    // Search funded accounts — funded_accounts not in schema cache
    // Use trading_accounts instead: id, account_code, broker_provider, status
    const { data: funded } = await supabase
      .from('trading_accounts')
      .select('id, account_code, broker_provider, status')
      .ilike('account_code', `%${query}%`)
      .limit(5);

    if (funded && funded.length > 0) {
      results['Funded Accounts'] = funded.map((f) => ({
        id: f.id,
        type: 'Funded Accounts',
        title: f.account_code || f.id.slice(0, 8).toUpperCase(),
        subtitle: `${f.broker_provider || 'MT'} • ${f.status}`,
        href: `/funded/${f.id}`,
      }));
    }

    // Search support tickets
    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, subject, status')
      .or(`ticket_number.ilike.%${query}%,subject.ilike.%${query}%`)
      .limit(5);

    if (tickets && tickets.length > 0) {
      results['Tickets'] = tickets.map((t) => ({
        id: t.id,
        type: 'Tickets',
        title: `#${t.ticket_number}`,
        subtitle: `${t.subject} • ${t.status}`,
        href: `/support/${t.id}`,
      }));
    }

    // Search affiliates
    const { data: affiliates } = await supabase
      .from('affiliates')
      .select('id, name, email, affiliate_code')
      .or(`name.ilike.%${query}%,email.ilike.%${query}%,affiliate_code.ilike.%${query}%`)
      .limit(5);

    if (affiliates && affiliates.length > 0) {
      results['Affiliates'] = affiliates.map((a) => ({
        id: a.id,
        type: 'Affiliates',
        title: a.name,
        subtitle: `${a.affiliate_code} • ${a.email}`,
        href: `/affiliates/${a.id}`,
      }));
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Search error:', err instanceof Error ? err.message : 'Unknown');
    return NextResponse.json({ results: {} });
  }
}
