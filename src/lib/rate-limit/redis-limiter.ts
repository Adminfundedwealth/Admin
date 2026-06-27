import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Redis-backed rate limiter using Upstash.
 * Replaces in-memory rate limiting for production serverless deployments.
 * 
 * Falls back to a permissive pass-through if Redis is not configured,
 * so the application doesn't crash in development.
 */

let readLimiter: Ratelimit | null = null;
let writeLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function initLimiters() {
  const redis = getRedis();
  if (!redis) return;

  readLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '60 s'),
    prefix: 'ratelimit:read',
    analytics: true,
  });

  writeLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '60 s'),
    prefix: 'ratelimit:write',
    analytics: true,
  });
}

// Initialize on first import
initLimiters();

export interface RedisRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Check rate limit via Redis (Upstash).
 * If Redis is not configured, falls back to in-memory.
 */
export async function checkRedisRateLimit(
  staffId: string,
  method: string
): Promise<RedisRateLimitResult> {
  const isWrite = WRITE_METHODS.includes(method.toUpperCase());
  const limiter = isWrite ? writeLimiter : readLimiter;

  if (!limiter) {
    // Redis not configured — fall back to permissive (in-memory handled elsewhere)
    return { allowed: true, remaining: 99, resetInSeconds: 60 };
  }

  try {
    const result = await limiter.limit(staffId);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetInSeconds: Math.ceil((result.reset - Date.now()) / 1000),
    };
  } catch (err) {
    // Redis error — fail open (don't block users if Redis is down)
    console.error('Redis rate limit error:', err instanceof Error ? err.message : 'Unknown');
    return { allowed: true, remaining: 99, resetInSeconds: 60 };
  }
}

/**
 * Check if Redis rate limiting is available.
 */
export function isRedisConfigured(): boolean {
  return readLimiter !== null && writeLimiter !== null;
}
