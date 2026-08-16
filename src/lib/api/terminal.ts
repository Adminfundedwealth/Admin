/**
 * Terminal Admin API client — server-side only.
 *
 * Used by Admin OS API proxy routes to call Terminal admin endpoints.
 * Authentication: x-admin-secret header (service-to-service).
 *
 * NEVER import this in client components — it reads server env vars.
 */

const TERMINAL_API_URL = (process.env.TERMINAL_API_URL || 'https://terminal.fundedwealth.com').replace(/\/$/, '');
const TERMINAL_ADMIN_SECRET = process.env.TERMINAL_ADMIN_SECRET || '';

export type TerminalPlan = 'flash' | 'instant' | 'onestep' | 'twostep';

const VALID_PLANS: TerminalPlan[] = ['flash', 'instant', 'onestep', 'twostep'];

export function isValidPlan(plan: string): plan is TerminalPlan {
  return VALID_PLANS.includes(plan as TerminalPlan);
}

/**
 * Make an authenticated request to the Terminal admin API.
 * Uses x-admin-secret for service-to-service auth.
 */
export async function terminalAdminFetch(
  path: string,
  options: RequestInit = {},
  adminId?: string,
): Promise<Response> {
  if (!TERMINAL_ADMIN_SECRET) {
    throw new Error('TERMINAL_ADMIN_SECRET is not configured. Add it to environment variables.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-admin-secret': TERMINAL_ADMIN_SECRET,
  };
  if (adminId) headers['x-admin-id'] = adminId;

  // Merge any caller-supplied headers
  if (options.headers) {
    const h = options.headers as Record<string, string>;
    Object.assign(headers, h);
  }

  const url = `${TERMINAL_API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  return res;
}

export function profilePath(plan: TerminalPlan): string {
  return `/api/admin/${plan}/profile`;
}

export function auditPath(plan: TerminalPlan): string {
  return `/api/admin/${plan}/audit`;
}