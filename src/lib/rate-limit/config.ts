export interface RateLimitConfig {
  /** Maximum requests per window for read operations */
  readLimit: number;
  /** Maximum requests per window for write operations */
  writeLimit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  readLimit: 100,     // 100 read requests per minute
  writeLimit: 30,     // 30 write requests per minute
  windowMs: 60_000,   // 1 minute window
};

/** HTTP methods classified as write operations */
export const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** HTTP methods classified as read operations */
export const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];
