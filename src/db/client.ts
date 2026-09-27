/**
 * Amira Store — PostgreSQL data-layer client (Drizzle + node-postgres).
 *
 * Policy (PHASE-02):
 * - PostgreSQL/Neon is the ONLY application data layer (no SQLite).
 * - One driver (`pg`) everywhere: app runtime, seed/bootstrap/verify scripts
 *   and drizzle-kit all speak the same wire protocol, so behavior verified
 *   locally on a disposable PostgreSQL is exactly what runs against Neon.
 * - The driver/provider choice is isolated HERE. If we later adopt the
 *   Neon serverless driver for edge runtimes, only this file changes.
 *
 * Connection guidance (docs/ops/DATABASE.md):
 * - App on Vercel → Neon POOLED connection string (`...-pooler...neon.tech`)
 *   because serverless functions open many short-lived connections.
 * - Migrations/one-off scripts → Neon DIRECT (non-pooler) endpoint.
 * - Local development → any disposable PostgreSQL via DATABASE_URL.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema';

function isLocalHost(host: string | undefined): boolean {
  if (!host) return true;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.sock')
  );
}

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Provide a PostgreSQL (Neon) connection string — see .env.example.',
    );
  }

  let host: string | undefined;
  let hasSslMode = false;
  try {
    const parsed = new URL(connectionString);
    host = parsed.hostname;
    hasSslMode = parsed.searchParams.has('sslmode');
  } catch {
    // Non-URL connection strings (e.g. libpq key=value form) — treat as remote-safe.
    hasSslMode = connectionString.includes('sslmode=');
  }

  const config: PoolConfig = {
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  };

  // Remote hosts (Neon) require TLS. Honor an explicit sslmode in the URL;
  // otherwise enable SSL with standard certificate verification.
  if (!isLocalHost(host) && !hasSslMode) {
    config.ssl = { rejectUnauthorized: true };
  }

  return config;
}

const globalForDb = globalThis as unknown as {
  amiraPgPool?: Pool;
  amiraDb?: NodePgDatabase<typeof schema>;
};

function getPool(): Pool {
  globalForDb.amiraPgPool ??= new Pool(buildPoolConfig());
  return globalForDb.amiraPgPool;
}

/** Drizzle client bound to the full schema — the single app data-layer handle. */
export function getDb(): NodePgDatabase<typeof schema> {
  globalForDb.amiraDb ??= drizzle(getPool(), { schema });
  return globalForDb.amiraDb;
}

/**
 * Convenience singleton export (server-only code must import from here).
 * Implemented as a lazy proxy so that merely importing this module never
 * validates env or opens resources — first query/transaction use does.
 */
export const db: AmiraDatabase = /* @__PURE__ */ new Proxy(
  {} as AmiraDatabase,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDb() as object, prop, receiver);
    },
    has(_target, prop) {
      return Reflect.has(getDb() as object, prop);
    },
  },
);

/** Underlying pool — exposed for graceful shutdown in scripts/tools only. */
export { getPool };

export type AmiraDatabase = NodePgDatabase<typeof schema>;
export { schema };
