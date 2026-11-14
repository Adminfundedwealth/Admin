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

import { z } from 'zod';

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

const CatalogSchema = z.object({
  products: z.array(z.object({
    slug: z.enum(['flash', 'instant', '1step', '2step']),
    displayLabel: z.string(),
    serverLabel: z.string(),
    leverage: z.string(),
    profitSplit: z.string(),
    duration: z.string(),
    maxLoss: z.string(),
    dailyLoss: z.string(),
    profitTarget: z.string(),
    minDays: z.string(),
    rules: z.object({
      profitTargetPct: z.number(),
      dailyLossLimitPct: z.number(),
      maxDrawdownPct: z.number(),
      minTradingDays: z.number(),
      maxDaysAllowed: z.number(),
      type: z.string(),
    }),
    sizes: z.array(z.object({
      index: z.number().int().nonnegative(),
      accountSize: z.number().positive(),
      sizeLabel: z.string(),
      fee: z.number().nonnegative(),
      popular: z.boolean(),
    })),
  })),
});

const PRODUCTION_API_BASE = 'https://fundedwealth-api-production.up.railway.app';

function normalizeMainSiteApiBase(value: string): string {
  return value
    .replace(/^(https?:\/\/)api\.fundedwealth(?:11)?\.com(?=[:/]|$)/i, '$1fundedwealth-api-production.up.railway.app')
    .replace(/\/+$/, '');
}

/**
 * Resolve the Main Website API base URL.
 * Priority: MAINSITE_API_URL env → MAINSITE_WEBHOOK_URL origin → production default.
 */
export function mainSiteApiBase(): string {
  const explicit = process.env.MAINSITE_API_URL;
  if (explicit) return normalizeMainSiteApiBase(explicit);
  const webhook = process.env.MAINSITE_WEBHOOK_URL;
  if (webhook) {
    try {
      const origin = new URL(webhook).origin;
      if (!origin.includes('railway') && !origin.includes('api')) return PRODUCTION_API_BASE;
      return normalizeMainSiteApiBase(origin);
    } catch {
      return PRODUCTION_API_BASE;
    }
  }
  return PRODUCTION_API_BASE;
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

export async function reviewManualPayment(input: {
  paymentId: number;
  action: 'approve' | 'reject';
  rejectionReason?: string;
}): Promise<{ success: boolean; message?: string; alreadyApproved?: boolean }> {
  const endpoint = input.action === 'approve' ? 'approve' : 'reject';
  const res = await fetch(
    `${mainSiteApiBase()}/api/payments/admin/${endpoint}-payment/${input.paymentId}`,
    {
      method: 'POST',
      headers: internalHeaders(),
      cache: 'no-store',
      body: JSON.stringify(
        input.action === 'reject' ? { rejectionReason: input.rejectionReason } : {},
      ),
    },
  );
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.success === false) {
    throw new MainSiteError(
      json?.message || `Payment review failed (${res.status})`,
      res.status || 500,
    );
  }

  return json;
}

/**
 * Fetch the production challenge catalog.
 * Reads the canonical catalog from the Main Site API. Fail closed if it is unavailable.
 */
export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const res = await fetch(`${mainSiteApiBase()}/api/provisioning/catalog`, {
    method: 'GET',
    headers: internalHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Product catalog unavailable (${res.status})`;
    throw new MainSiteError(message, res.status || 502);
  }
  const parsed = CatalogSchema.safeParse(body);
  if (!parsed.success) {
    throw new MainSiteError('Main site returned an invalid product catalog.', 502);
  }
  return parsed.data.products;
}

export function challengeStorageType(plan: PlanSlug): 'funded' | 'evaluation_phase1' {
  return plan === 'flash' || plan === 'instant' ? 'funded' : 'evaluation_phase1';
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
