/**
 * Durable request throttling state.
 *
 * Raw client identifiers are never stored here. Callers pass a one-way
 * application-derived key hash (for example an HMAC-hashed client IP).
 * A fixed window + atomic UPSERT gives serverless-safe admission control.
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const requestRateLimits = pgTable(
  'request_rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(),
    keyHash: text('key_hash').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('request_rate_limits_scope_key_window_key').on(
      t.scope,
      t.keyHash,
      t.windowStartedAt,
    ),
    index('idx_request_rate_limits_window').on(t.windowStartedAt),
  ],
);
