/**
 * Shared authenticated fetch wrapper for all Admin dashboard client components.
 *
 * Retrieves a session-bound CSRF token before each mutation and retries once
 * when middleware rejects a stale token.
 *
 * Usage (drop-in replacement for fetch):
 *   import { apiFetch } from '@/lib/api/fetch';
 *   const res = await apiFetch('/api/founder/emergency-provision', { method: 'POST', body: ... });
 */

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

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('__csrf_token='));
  if (!cookie) return null;

  const value = cookie.slice('__csrf_token='.length);
  try {
    return decodeURIComponent(value) || null;
  } catch {
    return null;
  }
}

/**
 * The middleware already places the session-bound CSRF token in a readable
 * cookie on authenticated responses. Reuse it instead of spending a rate-
 * limited GET request before every mutation.
 */
async function fetchCsrfToken(forceRefresh = false): Promise<string> {
  const cookieToken = forceRefresh ? null : readCsrfCookie();
  if (cookieToken) return cookieToken;

  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Unable to retrieve a CSRF token (HTTP ${response.status})`);
  }

  const json = await readApiJson(response);
  if (typeof json.token !== 'string' || !json.token) {
    throw new Error('The server returned an invalid CSRF token response');
  }

  return json.token;
}

async function isCsrfFailure(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body: unknown = await response.clone().json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
    const error = (body as Record<string, unknown>).error;
    return typeof error === 'object' && error !== null && !Array.isArray(error) &&
      (error as Record<string, unknown>).code === 'CSRF_INVALID';
  } catch {
    return false;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING.has(method)) {
    headers.set('x-csrf-token', await fetchCsrfToken());

    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  let response = await fetch(input, { ...init, headers, credentials: 'include' });
  const canRetry = !(
    init.body &&
    typeof ReadableStream !== 'undefined' &&
    init.body instanceof ReadableStream
  );
  if (MUTATING.has(method) && canRetry && await isCsrfFailure(response)) {
    headers.set('x-csrf-token', await fetchCsrfToken(true));
    response = await fetch(input, { ...init, headers, credentials: 'include' });
  }
  return response;
}
