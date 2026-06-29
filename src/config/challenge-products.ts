/**
 * Challenge Products Configuration — SINGLE SOURCE OF TRUTH.
 *
 * This file defines the production challenge types and their parameters.
 * Both the regular Manual Provision and the Founder Emergency Provision
 * MUST use these definitions so that provisioned accounts are identical
 * to those created through the normal website checkout.
 *
 * Production products: Flash, Instant, 1-Step, 2-Step
 *
 * If the configurations table (category='challenge_products') has entries,
 * they override these defaults. Otherwise these are canonical.
 */

export interface ChallengeProductConfig {
  /** Unique slug used as challenge_type in DB (e.g. 'flash', 'instant', '1-step', '2-step') */
  slug: string;
  /** Display name shown in UI */
  displayName: string;
  /** Available account sizes in INR */
  accountSizes: number[];
  /** Number of phases (1 for direct funded, 2 for two-step) */
  phases: number;
  /** Starting phase number when account is created */
  startingPhase: number;
  /** Profit target percentage */
  profitTargetPct: number;
  /** Daily loss limit percentage */
  dailyDrawdownLimitPct: number;
  /** Maximum overall drawdown percentage */
  maxDrawdownLimitPct: number;
  /** Minimum number of trading days required */
  minTradingDays: number;
  /** Maximum calendar days allowed (null = unlimited) */
  maxTradingDays: number | null;
  /** Leverage offered (e.g. '1:100') */
  leverage: string;
  /** Trading platform */
  platform: string;
  /** Profit split percentage for funded phase */
  profitSplitPct: number;
  /** Payout schedule */
  payoutSchedule: string;
  /** Broker provider identifier */
  brokerProvider: string;
}

/**
 * Production challenge products — matches the website checkout exactly.
 * These are the ONLY valid challenge types.
 */
export const CHALLENGE_PRODUCTS: ChallengeProductConfig[] = [
  {
    slug: 'flash',
    displayName: 'Flash',
    accountSizes: [25000, 50000, 100000, 200000],
    phases: 1,
    startingPhase: 1,
    profitTargetPct: 8,
    dailyDrawdownLimitPct: 4,
    maxDrawdownLimitPct: 8,
    minTradingDays: 2,
    maxTradingDays: null,
    leverage: '1:100',
    platform: 'match-trader',
    profitSplitPct: 80,
    payoutSchedule: 'on-demand',
    brokerProvider: 'fundedwealth',
  },
  {
    slug: 'instant',
    displayName: 'Instant',
    accountSizes: [25000, 50000, 100000, 200000, 500000],
    phases: 1,
    startingPhase: 1,
    profitTargetPct: 10,
    dailyDrawdownLimitPct: 5,
    maxDrawdownLimitPct: 10,
    minTradingDays: 3,
    maxTradingDays: null,
    leverage: '1:100',
    platform: 'match-trader',
    profitSplitPct: 80,
    payoutSchedule: 'bi-weekly',
    brokerProvider: 'fundedwealth',
  },
  {
    slug: '1-step',
    displayName: '1-Step',
    accountSizes: [25000, 50000, 100000, 200000, 500000, 1000000],
    phases: 1,
    startingPhase: 1,
    profitTargetPct: 10,
    dailyDrawdownLimitPct: 5,
    maxDrawdownLimitPct: 10,
    minTradingDays: 5,
    maxTradingDays: 30,
    leverage: '1:100',
    platform: 'match-trader',
    profitSplitPct: 85,
    payoutSchedule: 'bi-weekly',
    brokerProvider: 'fundedwealth',
  },
  {
    slug: '2-step',
    displayName: '2-Step',
    accountSizes: [25000, 50000, 100000, 200000, 500000, 1000000],
    phases: 2,
    startingPhase: 1,
    profitTargetPct: 8,
    dailyDrawdownLimitPct: 5,
    maxDrawdownLimitPct: 10,
    minTradingDays: 5,
    maxTradingDays: 45,
    leverage: '1:100',
    platform: 'match-trader',
    profitSplitPct: 90,
    payoutSchedule: 'bi-weekly',
    brokerProvider: 'fundedwealth',
  },
];

/** Map slug → config for fast lookup */
export const PRODUCTS_BY_SLUG: Record<string, ChallengeProductConfig> = Object.fromEntries(
  CHALLENGE_PRODUCTS.map((p) => [p.slug, p])
);

/** All valid challenge type slugs */
export const VALID_CHALLENGE_SLUGS = CHALLENGE_PRODUCTS.map((p) => p.slug) as [string, ...string[]];

/** All unique account sizes across all products (sorted) */
export const ALL_ACCOUNT_SIZES = Array.from(new Set(CHALLENGE_PRODUCTS.flatMap((p) => p.accountSizes))).sort((a, b) => a - b);

/**
 * Get the product config for a given slug. Returns null if not found.
 */
export function getProductConfig(slug: string): ChallengeProductConfig | null {
  return PRODUCTS_BY_SLUG[slug] || null;
}

/**
 * Validate that a given account size is valid for a specific challenge type.
 */
export function isValidAccountSize(slug: string, size: number): boolean {
  const product = getProductConfig(slug);
  if (!product) return false;
  return product.accountSizes.includes(size);
}
