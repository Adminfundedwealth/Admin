/**
 * Shared authenticated fetch wrapper for all Admin dashboard client components.
 *
 * Automatically:
 *   - Reads the __csrf_token cookie set by middleware
 *   - Sends it as x-csrf-token header on every mutating request (POST/PUT/PATCH/DELETE)
 *   - Sets credentials: 'include' so session cookies are always forwarded
 *
 * Usage (drop-in replacement for fetch):
 *   import { apiFetch } from '@/lib/api/fetch';
 *   const res = await apiFetch('/api/founder/emergency-provision', { method: 'POST', body: ... });
 */

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((c) => c.startsWith('__csrf_token='))
      ?.split('=')[1] ?? ''
  );
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  // Always send session cookies
  const credentials: RequestCredentials = 'include';

  if (MUTATING.has(method)) {
    const token = getCsrfToken();
    if (token) {
      headers.set('x-csrf-token', token);
    }
    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return fetch(input, { ...init, headers, credentials });
}
