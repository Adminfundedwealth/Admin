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
 * Local catalog — mirrors @workspace/products exactly.
 * Used as primary source so Emergency Provision works even when the
 * api-server catalog endpoint is unavailable.
 */
const LOCAL_CATALOG: CatalogProduct[] = [
  {
    slug: 'flash',
    displayLabel: 'Flash',
    serverLabel: 'Flash Funding',
    leverage: '1:100',
    profitSplit: '80%',
    duration: '24 Hours',
    maxLoss: '4%',
    dailyLoss: '2%',
    profitTarget: '—',
    minDays: '—',
    rules: { profitTargetPct: 0, dailyLossLimitPct: 2, maxDrawdownPct: 4, minTradingDays: 0, maxDaysAllowed: 1, type: 'flash_funding' },
    sizes: [
      { index: 0, accountSize: 50000,   sizeLabel: '₹50,000',    fee: 1999,  popular: false },
      { index: 1, accountSize: 100000,  sizeLabel: '₹1,00,000',  fee: 3499,  popular: false },
      { index: 2, accountSize: 250000,  sizeLabel: '₹2,50,000',  fee: 7499,  popular: true  },
      { index: 3, accountSize: 500000,  sizeLabel: '₹5,00,000',  fee: 11499, popular: false },
      { index: 4, accountSize: 1000000, sizeLabel: '₹10,00,000', fee: 19499, popular: false },
    ],
  },
  {
    slug: 'instant',
    displayLabel: 'Instant',
    serverLabel: 'Instant Funding',
    leverage: '1:50',
    profitSplit: '80%',
    duration: 'Unlimited',
    maxLoss: '5%',
    dailyLoss: '3%',
    profitTarget: 'N/A',
    minDays: '7',
    rules: { profitTargetPct: 0, dailyLossLimitPct: 3, maxDrawdownPct: 5, minTradingDays: 7, maxDaysAllowed: 365, type: 'instant_funding' },
    sizes: [
      { index: 0, accountSize: 100000,  sizeLabel: '₹1,00,000',  fee: 4999,  popular: false },
      { index: 1, accountSize: 500000,  sizeLabel: '₹5,00,000',  fee: 10999, popular: true  },
      { index: 2, accountSize: 1000000, sizeLabel: '₹10,00,000', fee: 17999, popular: false },
      { index: 3, accountSize: 2000000, sizeLabel: '₹20,00,000', fee: 29999, popular: false },
    ],
  },
  {
    slug: '1step',
    displayLabel: '1-Step',
    serverLabel: '1-Step Evaluation',
    leverage: '1:30',
    profitSplit: '80%',
    duration: 'Unlimited',
    maxLoss: '6%',
    dailyLoss: '3%',
    profitTarget: '10%',
    minDays: '5',
    rules: { profitTargetPct: 10, dailyLossLimitPct: 3, maxDrawdownPct: 6, minTradingDays: 5, maxDaysAllowed: 365, type: '1step_evaluation' },
    sizes: [
      { index: 0, accountSize: 100000,  sizeLabel: '₹1,00,000',  fee: 2999,  popular: false },
      { index: 1, accountSize: 500000,  sizeLabel: '₹5,00,000',  fee: 11999, popular: true  },
      { index: 2, accountSize: 1000000, sizeLabel: '₹10,00,000', fee: 21999, popular: false },
      { index: 3, accountSize: 2500000, sizeLabel: '₹25,00,000', fee: 48499, popular: false },
    ],
  },
  {
    slug: '2step',
    displayLabel: '2-Step',
    serverLabel: '2-Step Evaluation',
    leverage: '1:30',
    profitSplit: '80%',
    duration: 'Unlimited',
    maxLoss: '8%',
    dailyLoss: '3%',
    profitTarget: '8% + 5%',
    minDays: '5',
    rules: { profitTargetPct: 8, dailyLossLimitPct: 3, maxDrawdownPct: 8, minTradingDays: 5, maxDaysAllowed: 365, type: '2step_evaluation_phase1' },
    sizes: [
      { index: 0, accountSize: 500000,  sizeLabel: '₹5,00,000',  fee: 11999, popular: false },
      { index: 1, accountSize: 1000000, sizeLabel: '₹10,00,000', fee: 21999, popular: true  },
      { index: 2, accountSize: 2500000, sizeLabel: '₹25,00,000', fee: 48499, popular: false },
    ],
  },
];

/**
 * Resolve the Main Website API base URL.
 * Priority: MAINSITE_API_URL env → MAINSITE_WEBHOOK_URL origin → production default.
 */
export function mainSiteApiBase(): string {
  const explicit = process.env.MAINSITE_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const webhook = process.env.MAINSITE_WEBHOOK_URL;
  if (webhook) {
    try {
      const origin = new URL(webhook).origin;
      if (!origin.includes('railway') && !origin.includes('api')) {
        return 'https://api.fundedwealth.com';
      }
      return origin;
    } catch {
      /* fall through */
    }
  }
  return 'https://api.fundedwealth.com';
}

function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Prefer INTERNAL_PROVISION_SECRET; fall back to SUPABASE_SERVICE_ROLE_KEY
  // Both are accepted by the api-server's allowInternalOrAdmin middleware
  const secret = process.env.INTERNAL_PROVISION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
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
 * Fetch the production challenge catalog.
 * Returns the local catalog immediately — no network call needed.
 * The local catalog is kept in sync with @workspace/products (single source of truth).
 */
export async function fetchCatalog(): Promise<CatalogProduct[]> {
  return LOCAL_CATALOG;
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
