/**
 * A fixed-window rate limiter.
 *
 * Deliberately minimal: counters live in a module-level Map, so a serverless
 * deployment limits per instance rather than globally — someone determined gets
 * roughly `limit × instances`. That is enough to stop a stuck client or a
 * casual scraper burning the AI budget, which is all this is for. A real limit
 * needs shared state (Upstash, Vercel KV).
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Seconds until the window resets, for `Retry-After`. */
  retryAfter: number;
};

export type RateLimiter = (key: string, now?: number) => RateLimitResult;

export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    // Opportunistic sweep: without it a busy deployment accumulates a key per
    // caller forever.
    if (windows.size > 10_000) {
      for (const [entryKey, entry] of windows) {
        if (entry.resetAt <= now) windows.delete(entryKey);
      }
    }

    const existing = windows.get(key);
    const window =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

    window.count += 1;
    windows.set(key, window);

    const allowed = window.count <= limit;

    return {
      allowed,
      remaining: Math.max(0, limit - window.count),
      resetAt: window.resetAt,
      retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
    };
  };
}

/**
 * Who a request is from, for limiting purposes.
 *
 * `x-forwarded-for` is set by Vercel's edge and is the only thing available; it
 * is spoofable, which is another reason this is a budget guard rather than a
 * security control.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return headers.get("x-real-ip") ?? "unknown";
}
