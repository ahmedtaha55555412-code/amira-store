/**
 * Serverless-safe fixed-window request rate limiter.
 *
 * The keyHash MUST already be one-way/HMAC-derived by the caller. This module
 * never receives or stores raw IP addresses or other direct identifiers.
 * Admission is a single PostgreSQL UPSERT against a unique
 * (scope, key_hash, window_started_at) key, so concurrent Vercel instances
 * cannot each observe an independent under-limit counter.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';

export type DurableRateLimitOptions = {
  scope: string;
  keyHash: string;
  windowMs: number;
  maxAttempts: number;
};

export type DurableRateLimitResult = {
  allowed: boolean;
  attempts: number;
  retryAfterSeconds: number;
};

export async function consumeDurableRateLimit(
  options: DurableRateLimitOptions,
  nowMs = Date.now(),
): Promise<DurableRateLimitResult> {
  if (!Number.isInteger(options.windowMs) || options.windowMs <= 0) {
    throw new RangeError('windowMs must be a positive integer');
  }
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts <= 0) {
    throw new RangeError('maxAttempts must be a positive integer');
  }

  const windowStartMs = Math.floor(nowMs / options.windowMs) * options.windowMs;
  const windowStartedAt = new Date(windowStartMs);
  const windowEndMs = windowStartMs + options.windowMs;

  const result = await db.execute<{ attempts: number }>(sql`
    insert into request_rate_limits (scope, key_hash, window_started_at, attempts)
    values (${options.scope}, ${options.keyHash}, ${windowStartedAt}, 1)
    on conflict (scope, key_hash, window_started_at)
    do update set
      attempts = request_rate_limits.attempts + 1,
      updated_at = now()
    returning attempts
  `);

  const attempts = Number(result.rows[0]?.attempts ?? 0);
  const allowed = attempts <= options.maxAttempts;

  try {
    await db.execute(sql`
      delete from request_rate_limits
      where scope = ${options.scope}
        and window_started_at < ${new Date(nowMs - options.windowMs * 2)}
    `);
  } catch {
    // Cleanup is non-critical; a cleanup failure must never change admission.
  }

  return {
    allowed,
    attempts,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000)),
  };
}
