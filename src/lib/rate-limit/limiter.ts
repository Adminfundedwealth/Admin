import { DEFAULT_RATE_LIMIT_CONFIG, WRITE_METHODS, type RateLimitConfig } from './config';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  limit: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * In-memory token bucket rate limiter.
 * Keyed by staffId + type (read/write).
 * 
 * NOTE: In a multi-instance deployment, this should be replaced with
 * a Redis-based rate limiter. For Vercel serverless, each instance
 * has its own bucket, providing approximate rate limiting.
 */
const buckets = new Map<string, TokenBucket>();

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  /**
   * Check if a request is allowed under rate limits.
   * Consumes a token if allowed.
   */
  check(staffId: string, method: string): RateLimitResult {
    const type = WRITE_METHODS.includes(method.toUpperCase()) ? 'write' : 'read';
    const limit = type === 'write' ? this.config.writeLimit : this.config.readLimit;
    const key = `${staffId}:${type}`;

    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.config.windowMs) {
      // Full window has passed, refill completely
      bucket.tokens = limit;
      bucket.lastRefill = now;
    } else {
      // Partial refill based on time elapsed
      const refillRate = limit / this.config.windowMs;
      const tokensToAdd = Math.floor(elapsed * refillRate);
      if (tokensToAdd > 0) {
        bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
      }
    }

    const resetInSeconds = Math.ceil(
      (this.config.windowMs - (now - bucket.lastRefill)) / 1000
    );

    if (bucket.tokens <= 0) {
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: Math.max(1, resetInSeconds),
        limit,
      };
    }

    // Consume a token
    bucket.tokens -= 1;

    return {
      allowed: true,
      remaining: Math.max(0, bucket.tokens),
      resetInSeconds: Math.max(1, resetInSeconds),
      limit,
    };
  }

  /**
   * Get remaining requests without consuming a token.
   */
  getRemaining(staffId: string, method: string): number {
    const type = WRITE_METHODS.includes(method.toUpperCase()) ? 'write' : 'read';
    const key = `${staffId}:${type}`;
    const bucket = buckets.get(key);

    if (!bucket) {
      return type === 'write' ? this.config.writeLimit : this.config.readLimit;
    }

    return Math.max(0, bucket.tokens);
  }

  /**
   * Get rate limit headers for the response.
   */
  getHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + result.resetInSeconds).toString(),
    };
  }
}

/** Singleton instance */
export const rateLimiter = new RateLimiter();
