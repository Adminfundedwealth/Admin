import { apiFetch, readApiJson } from '@/lib/api/fetch';

const CAMPAIGNS_URL = '/api/founder/promo-campaigns';
const CACHE_DURATION_MS = 15_000;
const MAX_RETRIES = 2;
const MAX_AUTOMATIC_WAIT_MS = 30_000;

export class CampaignRequestError extends Error {
  constructor(message: string, public readonly retryAfterMs = 0) {
    super(message);
    this.name = 'CampaignRequestError';
  }
}

let cachedCampaignPayload: Record<string, unknown> | null = null;
let cacheExpiresAt = 0;
let inFlightRequest: Promise<Record<string, unknown>> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function retryDelay(response: Response, attempt: number): Promise<number> {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }

  try {
    const payload = await response.clone().json();
    const seconds = payload?.error?.retryAfter;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  } catch {
    // Proxies may return an empty or non-JSON rate-limit response.
  }

  return 500 * (2 ** attempt);
}

function isTemporaryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function requestCampaigns(): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await apiFetch(CAMPAIGNS_URL, { cache: 'no-store' });
    } catch (error) {
      if (attempt === MAX_RETRIES || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new CampaignRequestError('The campaign service could not be reached. Please try again.');
      }
      await wait(500 * (2 ** attempt));
      continue;
    }

    if (response.ok) {
      const payload = await readApiJson(response);
      cachedCampaignPayload = payload;
      cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
      return payload;
    }

    if (!isTemporaryStatus(response.status)) {
      const payload = await readApiJson(response);
      const apiError = payload.error as { message?: string } | undefined;
      throw new CampaignRequestError(
        apiError?.message || `Unable to load campaigns (HTTP ${response.status})`
      );
    }

    const delay = await retryDelay(response, attempt);
    if (delay > MAX_AUTOMATIC_WAIT_MS) {
      throw new CampaignRequestError(
        'The campaign service is temporarily busy. Please retry after the indicated wait.',
        delay
      );
    }

    if (attempt === MAX_RETRIES) {
      throw new CampaignRequestError(
        'The campaign service is temporarily busy. Please try again shortly.',
        response.status === 429 ? delay : 0
      );
    }

    await wait(delay);
  }

  throw new CampaignRequestError('The campaign service could not be reached. Please try again.');
}

export function loadCampaigns(forceRefresh = false): Promise<Record<string, unknown>> {
  if (inFlightRequest) return inFlightRequest;
  if (!forceRefresh && cachedCampaignPayload && Date.now() < cacheExpiresAt) {
    return Promise.resolve(cachedCampaignPayload);
  }

  const request = requestCampaigns();
  inFlightRequest = request;
  void request.finally(() => {
    if (inFlightRequest === request) inFlightRequest = null;
  }).catch(() => {
    // Keep the original promise rejection observable to callers.
  });
  return request;
}

export function invalidateCampaignCache(): void {
  cachedCampaignPayload = null;
  cacheExpiresAt = 0;
}
