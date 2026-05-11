// In-memory sliding-window rate limiter cho internal app (21 user).
// Đủ tốt cho single-instance deployment. Khi scale ra multi-instance, thay bằng Redis/Upstash.

interface RateLimitWindow {
  /** timestamps (ms) của các request gần đây */
  timestamps: number[];
}

const buckets = new Map<string, RateLimitWindow>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
}

/**
 * Sliding window rate limit.
 * @param key - thường là `${endpoint}:${userId}`
 * @param max - số request tối đa trong cửa sổ
 * @param windowMs - cửa sổ tính (ms)
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = buckets.get(key) || { timestamps: [] };

  // Loại bỏ timestamps quá hạn
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: max - bucket.timestamps.length,
    resetAfterMs: windowMs,
  };
}

/** Cleanup buckets cũ (chạy mỗi giờ để không leak memory) */
let lastCleanup = Date.now();
export function cleanupRateLimiterIfNeeded(): void {
  const now = Date.now();
  if (now - lastCleanup < 60 * 60 * 1000) return;
  lastCleanup = now;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.length === 0 || bucket.timestamps[bucket.timestamps.length - 1] < dayAgo) {
      buckets.delete(key);
    }
  }
}
