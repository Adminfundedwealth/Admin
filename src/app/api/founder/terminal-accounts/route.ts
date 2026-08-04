export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireFounderInHandler } from '@/lib/security/require-auth';

const TERMINAL_API = process.env.TERMINAL_API_URL || 'https://terminal.fundedwealth.com';

/**
 * GET /api/founder/terminal-accounts
 * Proxies GET /api/admin/accounts on the terminal backend.
 * Query params: search, status, page, limit
 */
export async function GET(request: NextRequest) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const url = `${TERMINAL_API}/api/admin/accounts${qs ? `?${qs}` : ''}`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Option B: API key auth (works across subdomains)
    const adminApiKey = process.env.TERMINAL_ADMIN_API_KEY;
    if (adminApiKey) {
      headers['x-admin-api-key'] = adminApiKey;
    } else {
      // Option A fallback: forward fw_session cookie
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('fw_session')?.value;
      if (sessionCookie) headers['Cookie'] = `fw_session=${sessionCookie}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[terminal-accounts proxy] GET error:', err);
    return NextResponse.json(
      { error: { code: 'PROXY_ERROR', message: 'Failed to reach terminal backend' } },
      { status: 502 },
    );
  }
}
