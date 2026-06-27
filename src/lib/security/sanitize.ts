/**
 * Input sanitization utilities for preventing filter injection
 * in Supabase PostgREST queries.
 */

/**
 * Sanitize a search input for use in PostgREST .or() filter strings.
 * Strips characters that have special meaning in PostgREST filter syntax.
 * 
 * Dangerous characters: , . ( ) are PostgREST operators.
 */
export function sanitizeSearchInput(input: string): string {
  // Remove PostgREST special characters that could inject filter conditions
  return input
    .replace(/[,.()\[\]{}\\;'"]/g, '')  // Remove filter operators and SQL-dangerous chars
    .replace(/\s+/g, ' ')                // Normalize whitespace
    .trim()
    .slice(0, 200);                       // Limit length
}

/**
 * Sanitize a value for use in PostgREST .eq() / .ilike() filters.
 * Less restrictive than search sanitization since these use parameterized-like patterns.
 */
export function sanitizeFilterValue(input: string): string {
  return input
    .replace(/[\\'";\x00-\x1f]/g, '')   // Remove escape chars, quotes, null bytes
    .trim()
    .slice(0, 500);
}

/**
 * Validate a UUID format strictly.
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate and limit page size parameter.
 */
export function sanitizePageSize(value: string | null, max: number = 100): number {
  const parsed = parseInt(value || '20', 10);
  if (isNaN(parsed) || parsed < 1) return 20;
  return Math.min(parsed, max);
}

/**
 * Validate a page number parameter.
 */
export function sanitizePage(value: string | null): number {
  const parsed = parseInt(value || '1', 10);
  if (isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}
