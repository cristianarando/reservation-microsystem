// src/lib/rate-limit.ts
// Lightweight fixed-window rate limiter kept in process memory.
// Tuned with strict bucket caps for 1 GB RAM single-node deployments behind Nginx/Caddy.

type Bucket = { count: number; resetAt: number };

const MAX_BUCKETS = 5_000;
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, force = false) {
  if (!force && now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

/** Read-only check: does NOT consume a slot. */
export function peekRateLimit(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }
  const remaining = Math.max(0, limit - bucket.count);
  return {
    allowed: bucket.count < limit,
    remaining,
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Consumes one slot and reports whether the caller is still within the limit. */
export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      sweep(now, true);
      while (buckets.size >= MAX_BUCKETS) {
        const oldestKey = buckets.keys().next().value;
        if (!oldestKey) break;
        buckets.delete(oldestKey);
      }
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Resolves the client IP safely behind a reverse proxy (Nginx/Caddy).
 * With TRUSTED_PROXY_HOPS=1 (direct reverse proxy), reads the rightmost proxy-appended entry
 * in X-Forwarded-For so client-spoofed left-hand entries cannot bypass rate limiting.
 */
export function getClientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const trustedHops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1));
      const idx = Math.max(0, parts.length - trustedHops);
      return parts[idx];
    }
  }
  return realIp || "local";
}

export function tooManyRequestsBody(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return {
    error: `Demasiados intentos. Por seguridad, espera ${minutes} minuto(s) antes de volver a intentarlo.`,
    retryAfterSec,
  };
}
