/**
 * Amira Store — admin domain tables (single-admin model).
 *
 * Source: docs/DATA_DICTIONARY.md (admin_users, admin_sessions,
 * admin_activity_logs) + MASTER_PLAN §16 + PHASE-03 (consumer).
 *
 * Rules encoded here:
 * - exactly one admin is supported by application bootstrap (no create-admin flow);
 * - sessions store only a HASHED token, never the raw token;
 * - activity logs are audit records (admin_user_id is ON DELETE SET NULL so
 *   the audit trail survives).
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Username is the sole login identity — no email column by design (§16). */
    username: text('username').notNull(),
    /** Strong password hash only (PHASE-03 chooses the algorithm); never a password. */
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One admin model: unique username is the login key.
    uniqueIndex('admin_users_username_key').on(t.username),
    // Guard against bootstrap creating an empty-identity admin row.
    check('admin_users_username_nonempty', sql`length(trim(username)) > 0`),
    check(
      'admin_users_password_hash_nonempty',
      sql`length(password_hash) > 0`,
    ),
  ],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    /** SHA-256 (or stronger) digest of the session token — raw token lives only in the cookie. */
    sessionTokenHash: text('session_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    /** Salted/hash-processed client IP for security auditing; never the raw IP. */
    ipHash: text('ip_hash'),
  },
  (t) => [
    uniqueIndex('admin_sessions_token_hash_key').on(t.sessionTokenHash),
    // Login looks up sessions by admin; expiry sweep looks up by expires_at.
    index('idx_admin_sessions_admin').on(t.adminUserId),
    index('idx_admin_sessions_expires').on(t.expiresAt),
  ],
);

export const adminActivityLogs = pgTable(
  'admin_activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SET NULL: the audit record survives even if the admin row ever disappears. */
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    /** Code-limited action vocabulary (e.g. "order.shipping_cost_set") — text, not enum, so admin features can evolve. */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_admin_activity_logs_admin').on(t.adminUserId),
    index('idx_admin_activity_logs_entity').on(t.entityType, t.entityId),
    index('idx_admin_activity_logs_created').on(t.createdAt),
  ],
);

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type AdminActivityLog = typeof adminActivityLogs.$inferSelect;
