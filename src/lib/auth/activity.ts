/**
 * Amira Store — admin activity audit log writer (PHASE-03 task 10).
 *
 * Records login / password-change / logout / bootstrap activity in
 * `admin_activity_logs` WITHOUT storing passwords, tokens, or raw IPs.
 * Metadata passes through a redaction filter so a careless future caller can
 * still never persist credential-shaped values (PHASE-03 task 11).
 */

import { db } from '@/db/client';
import { adminActivityLogs } from '@/db/schema';

const SENSITIVE_KEY = /pass(word)?|pwd|token|secret|cookie|authorization|credential|session/i;

export type AdminActivityInput = {
  adminUserId?: string | null;
  /** Code-limited action vocabulary, e.g. "auth.login.failed". */
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Recursively redact credential-shaped keys from metadata before persisting. */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 6) return '[truncated]';
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => walk(item, depth + 1));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : walk(val, depth + 1);
      }
      return out;
    }
    if (typeof value === 'string' && value.length > 1000) {
      return `${value.slice(0, 1000)}…[truncated]`;
    }
    return value;
  };
  return walk(metadata, 0) as Record<string, unknown>;
}

export type AuditExecutor = Pick<typeof db, 'insert'>;

/**
 * Record one audit row. Pass a transaction as `executor` to make the audit
 * row ATOMIC with the mutation it describes (recommended for catalog
 * mutations — PHASE-04); omit it for standalone writes.
 */
export async function recordAdminActivity(
  input: AdminActivityInput,
  executor?: AuditExecutor,
): Promise<void> {
  const client = executor ?? db;
  await client.insert(adminActivityLogs).values({
    adminUserId: input.adminUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: sanitizeMetadata(input.metadata),
  });
}
