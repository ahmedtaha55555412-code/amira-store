/**
 * Amira Store — `@/db` barrel.
 *
 * Server-only. Import `db` here; import tables/types via `@/db/schema`.
 */

export { db, getDb, getPool, schema, type AmiraDatabase } from './client';
