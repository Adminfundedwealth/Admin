import { NextResponse } from 'next/server';
import {
  CSRF_COOKIE_NAME,
  generateCSRFToken,
} from './csrf';

export const SESSION_COOKIE_NAME = 'session_token';

export async function setSessionCookies(
  response: NextResponse,
  sessionToken: string,
  sessionExpiresAt: string,
): Promise<void> {
  const expiresAt = Date.parse(sessionExpiresAt);
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
  response.cookies.set(CSRF_COOKIE_NAME, await generateCSRFToken(sessionToken, expiresAt), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return response;
}
