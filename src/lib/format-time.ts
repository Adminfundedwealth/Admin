/**
 * Format a timestamp as a relative time string.
 * Examples: "now", "2m ago", "1h ago", "3d ago"
 */
export function formatRelativeTime(isoTimestamp: string | Date): string {
  const now = Date.now();
  const then = isoTimestamp instanceof Date ? isoTimestamp.getTime() : new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (isNaN(then)) return '—';
  if (diffMs < 0) return 'now';
  if (diffMs < 60_000) return 'now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  if (diffMs < 2_592_000_000) return `${Math.floor(diffMs / 604_800_000)}w ago`;
  return `${Math.floor(diffMs / 2_592_000_000)}mo ago`;
}

/**
 * Format a timestamp as full UTC ISO 8601 string for tooltip display.
 */
export function formatFullTimestamp(isoTimestamp: string | Date): string {
  const date = isoTimestamp instanceof Date ? isoTimestamp : new Date(isoTimestamp);
  if (isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/**
 * Format currency with ₹ symbol and Indian number formatting.
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
