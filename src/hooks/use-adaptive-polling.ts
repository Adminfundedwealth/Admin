'use client';

import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api/fetch';

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const inFlightPollingRequests = new Map<string, Promise<Response>>();

export class PollingRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'PollingRequestError';
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) return undefined;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export async function fetchForPolling(path: string): Promise<Response> {
  let request = inFlightPollingRequests.get(path);
  if (!request) {
    request = apiFetch(path, { cache: 'no-store' });
    inFlightPollingRequests.set(path, request);
    void request.finally(() => {
      if (inFlightPollingRequests.get(path) === request) {
        inFlightPollingRequests.delete(path);
      }
    }).catch(() => {
      // The returned request promise remains responsible for reporting the error.
    });
  }

  const response = (await request).clone();
  if (!response.ok) {
    throw new PollingRequestError(
      `Polling request failed (HTTP ${response.status})`,
      response.status,
      parseRetryAfter(response),
    );
  }
  return response;
}

export function useAdaptivePolling(callback: () => Promise<void>, intervalMs: number): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextAllowedAt = Date.now();

    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      nextAllowedAt = Date.now() + delayMs;
      if (document.visibilityState !== 'hidden') {
        timer = setTimeout(() => void poll(), delayMs);
      }
    };

    const poll = async () => {
      if (stopped || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      let nextDelay = intervalMs;

      try {
        await callbackRef.current();
        failures = 0;
      } catch (error) {
        failures += 1;
        if (
          error instanceof PollingRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          console.error('Dashboard polling stopped after a non-retryable response:', error);
          stopped = true;
          return;
        }

        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          console.error('Dashboard polling stopped after repeated failures:', error);
          stopped = true;
          return;
        }

        console.warn('Dashboard polling request failed; backing off:', error);
        nextDelay = error instanceof PollingRequestError && error.retryAfterMs !== undefined
          ? Math.max(1000, error.retryAfterMs)
          : Math.min(intervalMs * (2 ** failures), MAX_BACKOFF_MS);
      } finally {
        inFlight = false;
      }

      schedule(nextDelay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (!inFlight) schedule(Math.max(0, nextAllowedAt - Date.now()));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
}
