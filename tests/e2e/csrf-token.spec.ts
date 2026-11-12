import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { NextResponse } from 'next/server';
import { config, PUBLIC_AUTH_API_PATHS } from '../../src/middleware';
import {
  clearSessionCookies,
  setSessionCookies,
} from '../../src/lib/security/session-cookies';
import {
  generateCSRFToken,
  validateCSRFToken,
  verifyCSRFToken,
} from '../../src/lib/security/csrf';
import { apiFetch } from '../../src/lib/api/fetch';

test('CSRF token requires the current authenticated session and matching double-submit values', async () => {
  const sessionToken = 'session-token-one';
  const sessionExpiresAt = Date.now() + 60_000;
  const token = await generateCSRFToken(sessionToken, sessionExpiresAt);

  expect(await validateCSRFToken(token, token, sessionToken, sessionExpiresAt)).toBe(true);
  expect(await validateCSRFToken(undefined, token, sessionToken, sessionExpiresAt)).toBe(false);
  expect(await validateCSRFToken(token, null, sessionToken, sessionExpiresAt)).toBe(false);
  expect(await validateCSRFToken(token, 'incorrect-token', sessionToken, sessionExpiresAt)).toBe(false);
  expect(await validateCSRFToken(token, token, 'session-token-two', sessionExpiresAt)).toBe(false);
  expect(await verifyCSRFToken(token, sessionToken, sessionExpiresAt + 1)).toBe(false);
});

test('session replacement rotates tokens consistently across concurrent tabs', async () => {
  const sessionExpiresAt = Date.now() + 60_000;
  const tokens = await Promise.all(
    Array.from({ length: 8 }, () => generateCSRFToken('same-session', sessionExpiresAt)),
  );
  const replacementToken = await generateCSRFToken('renewed-session', sessionExpiresAt);

  expect(new Set(tokens).size).toBe(1);
  expect(replacementToken).not.toBe(tokens[0]);
  expect(await verifyCSRFToken(tokens[0], 'renewed-session', sessionExpiresAt)).toBe(false);
});

test('login and logout replace and clear both session cookies', async () => {
  const sessionExpiresAt = new Date(Date.now() + 60_000).toISOString();
  const loginResponse = NextResponse.json({ success: true });
  await setSessionCookies(loginResponse, 'login-session', sessionExpiresAt);

  const sessionCookie = loginResponse.cookies.get('session_token');
  const csrfCookie = loginResponse.cookies.get('__csrf_token');
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(csrfCookie?.httpOnly).toBe(false);
  expect(csrfCookie?.sameSite).toBe('strict');
  expect(csrfCookie?.path).toBe('/');
  expect(await verifyCSRFToken(csrfCookie?.value || '', 'login-session', Date.parse(sessionExpiresAt))).toBe(true);

  const logoutResponse = NextResponse.json({ success: true });
  clearSessionCookies(logoutResponse);
  expect(logoutResponse.cookies.get('session_token')?.maxAge).toBe(0);
  expect(logoutResponse.cookies.get('__csrf_token')?.maxAge).toBe(0);
});

test('apiFetch refreshes the token and sends it with credentials on mutations', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });
    if (input === '/api/auth/csrf') {
      return Response.json({ token: 'current-session-token' });
    }
    return new Response('ok', { status: 200 });
  };

  try {
    await apiFetch('/api/payments/test/review', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(requests).toHaveLength(2);
  expect(requests[0].init?.credentials).toBe('include');
  expect(requests[0].init?.cache).toBe('no-store');
  expect(requests[1].init?.credentials).toBe('include');
  expect(new Headers(requests[1].init?.headers).get('x-csrf-token')).toBe('current-session-token');
});

test('apiFetch retries once with a refreshed token after middleware rejects a stale session token', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  let tokenRequests = 0;
  globalThis.fetch = async (input, init) => {
    requests.push({
      input,
      init: init && { ...init, headers: new Headers(init.headers) },
    });
    if (input === '/api/auth/csrf') {
      tokenRequests += 1;
      return Response.json({ token: tokenRequests === 1 ? 'stale-token' : 'refreshed-token' });
    }
    if (new Headers(init?.headers).get('x-csrf-token') === 'stale-token') {
      return Response.json(
        { error: { code: 'CSRF_INVALID' } },
        { status: 403 },
      );
    }
    return new Response('ok', { status: 200 });
  };

  let response: Response;
  try {
    response = await apiFetch('/api/payments/test/review', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(response.status).toBe(200);
  expect(requests.filter(({ input }) => input === '/api/auth/csrf')).toHaveLength(2);
  expect(new Headers(requests[1].init?.headers).get('x-csrf-token')).toBe('stale-token');
  expect(new Headers(requests[3].init?.headers).get('x-csrf-token')).toBe('refreshed-token');
});

test('expired CSRF tokens are rejected', async () => {
  const sessionExpiresAt = Date.now() + 250;
  const token = await generateCSRFToken('expiring-session', sessionExpiresAt);
  await new Promise((resolve) => setTimeout(resolve, 275));

  expect(await verifyCSRFToken(token, 'expiring-session', sessionExpiresAt)).toBe(false);
});

test('all state-changing API routes pass through the global middleware', () => {
  const apiRoot = join(process.cwd(), 'src', 'app', 'api');
  const matcher = new RegExp(config.matcher[0]);
  const routeFiles: string[] = [];

  function collectRoutes(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collectRoutes(path);
      else if (entry.name === 'route.ts') routeFiles.push(path);
    }
  }

  collectRoutes(apiRoot);

  const mutationRoutes = routeFiles.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    if (!/export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\s*\(/.test(source)) {
      return [];
    }

    const route = relative(apiRoot, file)
      .split(sep)
      .join('/')
      .replace(/\/route\.ts$/, '')
      .replace(/\[[^\]]+\]/g, 'test-id');
    return [`/api/${route}`];
  });

  expect(mutationRoutes.length).toBeGreaterThan(0);
  for (const route of mutationRoutes) {
    expect(matcher.test(route), `${route} is not matched by middleware`).toBe(true);
  }
  expect(PUBLIC_AUTH_API_PATHS.has('/api/auth/logout')).toBe(false);
  expect(PUBLIC_AUTH_API_PATHS.has('/api/auth/csrf')).toBe(false);
  expect(PUBLIC_AUTH_API_PATHS.has('/api/auth/login')).toBe(true);
});
