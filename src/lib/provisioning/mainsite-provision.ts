/**
 * Main Website Provisioning Client.
 *
 * The Admin panel does NOT own any provisioning logic, challenge catalog,
 * risk rules, account sizes, or credential generation. ALL of that lives in
 * the Main Website (`@workspace/products` + `provisionChallenge`).
 *
 * This module is a thin HTTP client to the PRODUCTION provisioning service:
 *   - GET  /api/provisioning/catalog    → single-source-of-truth product list
 *   - POST /api/provisioning/emergency  → the SAME pipeline a website purchase uses
 *
 * Because Founder Emergency Provision and a website checkout both end up in
 * `provisionChallenge` on the Main Website, they create IDENTICAL
 * challenge_accounts, trading_accounts and risk settings.
 */

export type PlanSlug = 'flash' | 'instant' | '1step' | '2step';

export interface CatalogSize {
  index: number;
  accountSize: number;
  sizeLabel: string;
  fee: number;
  popular: boolean;
}

export interface CatalogProduct {
  slug: PlanSlug;
  displayLabel: string;
  serverLabel: string;
  leverage: string;
  profitSplit: string;
  duration: string;
  maxLoss: string;
  dailyLoss: string;
  profitTarget: string;
  minDays: string;
  rules: {
    profitTargetPct: number;
    dailyLossLimitPct: number;
    maxDrawdownPct: number;
    minTradingDays: number;
    maxDaysAllowed: number;
    type: string;
  };
  sizes: CatalogSize[];
}

export interface EmergencyProvisionResult {
  provisioningLogId: string;
  traderId: string;
  challengeAccountId: string;
  tradingAccountId: string;
  accountCode: string;
  accountSize: number;
}

/**
 * Resolve the Main Website API base URL.
 * Reuses the existing MAINSITE_WEBHOOK_URL origin so no brand-new config is
 * strictly required; MAINSITE_API_URL overrides it when present.
 */
export function mainSiteApiBase(): string {
  const explicit = process.env.MAINSITE_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const webhook = process.env.MAINSITE_WEBHOOK_URL;
  if (webhook) {
    try {
      return new URL(webhook).origin;
    } catch {
      /* fall through */
    }
  }
  return 'https://fundedwealth.com';
}

function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.INTERNAL_PROVISION_SECRET;
  if (secret) headers['x-internal-provision-secret'] = secret;
  return headers;
}

export class MainSiteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetch the production challenge catalog (single source of truth).
 */
export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const res = await fetch(`${mainSiteApiBase()}/api/provisioning/catalog`, {
    method: 'GET',
    headers: internalHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new MainSiteError(
      `Failed to load production catalog (${res.status}): ${body || res.statusText}`,
      res.status,
    );
  }

  // Guard against SPA catch-all returning HTML with 200
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new MainSiteError(
      `Production catalog returned non-JSON (${contentType}). Ensure MAINSITE_API_URL points to the api-server, not the frontend.`,
      502,
    );
  }

  const json = await res.json();
  return (json.products || []) as CatalogProduct[];
}

/**
 * Provision a challenge through the PRODUCTION pipeline (same as a website purchase).
 */
export async function provisionViaMainSite(input: {
  planType: PlanSlug;
  sizeIndex: number;
  userId?: string | null;
  email?: string | null;
  orderId?: string | null;
  note?: string | null;
}): Promise<EmergencyProvisionResult> {
  const res = await fetch(`${mainSiteApiBase()}/api/provisioning/emergency`, {
    method: 'POST',
    headers: internalHeaders(),
    cache: 'no-store',
    body: JSON.stringify({
      planType: input.planType,
      sizeIndex: input.sizeIndex,
      userId: input.userId ?? undefined,
      email: input.email ?? undefined,
      orderId: input.orderId ?? undefined,
      note: input.note ?? undefined,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.success === false) {
    const message = json?.error || `Provisioning failed (${res.status})`;
    throw new MainSiteError(message, res.status || 500);
  }

  return json.provisioning as EmergencyProvisionResult;
}

/**
 * Resolve a plan slug + account size into the catalog size index.
 * Returns null if the plan or size is not part of the production catalog.
 */
export function resolveSizeIndex(
  catalog: CatalogProduct[],
  slug: string,
  accountSize: number,
): number | null {
  const product = catalog.find((p) => p.slug === slug);
  if (!product) return null;
  const size = product.sizes.find((s) => s.accountSize === accountSize);
  return size ? size.index : null;
}
