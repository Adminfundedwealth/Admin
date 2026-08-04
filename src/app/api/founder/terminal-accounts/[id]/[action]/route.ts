export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireFounderInHandler } from '@/lib/security/require-auth';
import { cookies } from 'next/headers';

const TERMINAL_API = process.env.TERMINAL_API_URL || 'https://terminal.fundedwealth.com';

type Params = { params: Promise<{ id: string; action: string }> };

/**
 * Proxy for per-account terminal admin actions.
 *
 * GET  /api/founder/terminal-accounts/[id]/detail       → GET  /api/admin/accounts/:id
 * GET  /api/founder/terminal-accounts/[id]/positions    → GET  /api/admin/accounts/:id/positions
 * GET  /api/founder/terminal-accounts/[id]/risk-events  → GET  /api/admin/accounts/:id/risk-events
 * POST /api/founder/terminal-accounts/[id]/freeze       → POST /api/admin/accounts/:id/freeze
 * POST /api/founder/terminal-accounts/[id]/unfreeze     → POST /api/admin/accounts/:id/unfreeze
 * POST /api/founder/terminal-accounts/[id]/close-positions → POST /api/admin/accounts/:id/close-positions
 */
async function buildTerminalHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

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

  return headers;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const { id, action } = await params;

  // Map our action slug to the terminal endpoint path
  let terminalPath: string;
  if (action === 'detail') {
    terminalPath = `/api/admin/accounts/${id}`;
  } else if (action === 'positions') {
    terminalPath = `/api/admin/accounts/${id}/positions`;
  } else if (action === 'risk-events') {
    terminalPath = `/api/admin/accounts/${id}/risk-events`;
  } else {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
      { status: 404 },
    );
  }

  try {
    const headers = await buildTerminalHeaders();
    const res = await fetch(`${TERMINAL_API}${terminalPath}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[terminal-accounts proxy] GET ${terminalPath} error:`, err);
    return NextResponse.json(
      { error: { code: 'PROXY_ERROR', message: 'Failed to reach terminal backend' } },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { error: authError } = await requireFounderInHandler();
  if (authError) return authError;

  const { id, action } = await params;

  const allowedPostActions = ['freeze', 'unfreeze', 'close-positions'];
  if (!allowedPostActions.includes(action)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
      { status: 404 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine for unfreeze / close-positions
  }

  try {
    const headers = await buildTerminalHeaders();
    const res = await fetch(`${TERMINAL_API}/api/admin/accounts/${id}/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[terminal-accounts proxy] POST ${action} error:`, err);
    return NextResponse.json(
      { error: { code: 'PROXY_ERROR', message: 'Failed to reach terminal backend' } },
      { status: 502 },
    );
  }
}
