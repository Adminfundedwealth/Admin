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
 * Falls back to empty string if the request fails.
 */
async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (res.ok) {
      const json = await res.json();
      return (json.token as string) || '';
    }
  } catch {
    // Non-fatal — proceed without token
  }
  return '';
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
