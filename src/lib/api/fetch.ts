/**
 * Shared authenticated fetch wrapper for all Admin dashboard client components.
 *
 * Automatically:
 *   - Reads the __csrf_token cookie set by middleware
 *   - Sends it as x-csrf-token header on every mutating request (POST/PUT/PATCH/DELETE)
 *   - Sets credentials: 'include' so session cookies are always forwarded
 *   - Auto-fetches a fresh CSRF token if the cookie is missing (e.g. new tab, hard refresh)
 *
 * Usage (drop-in replacement for fetch):
 *   import { apiFetch } from '@/lib/api/fetch';
 *   const res = await apiFetch('/api/founder/emergency-provision', { method: 'POST', body: ... });
 */

const CSRF_COOKIE = '__csrf_token';

export async function readApiJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`The server returned an empty response (HTTP ${response.status})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status})`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`The server returned an invalid response (HTTP ${response.status})`);
  }

  return parsed as Record<string, unknown>;
}

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const entry = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  if (!entry) return '';
  // Use slice instead of split('=')[1] to correctly handle any '=' in the value
  const raw = entry.slice(CSRF_COOKIE.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Fetch a fresh CSRF token from the server when the cookie is unavailable.
 */
async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (response.status === 204) return '';
  if (!response.ok) {
    throw new Error(`Unable to retrieve a CSRF token (HTTP ${response.status})`);
  }

  const json = await readApiJson(response);
  if (typeof json.token !== 'string' || !json.token) {
    throw new Error('The server returned an invalid CSRF token response');
  }

  return json.token;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING.has(method)) {
    // Try reading the CSRF token from document.cookie first
    let token = getCsrfToken();

    // If not in document.cookie (e.g. new tab, hard refresh, cookie cleared),
    // fetch it from the server — middleware has it from the session cookie.
    if (!token) {
      token = await fetchCsrfToken();
    }

    if (token) {
      headers.set('x-csrf-token', token);
    }

    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return fetch(input, { ...init, headers, credentials: 'include' });
}
