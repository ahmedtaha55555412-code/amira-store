import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration — Amira Store (PostgreSQL/Neon).
 *
 * - Migrations live in ./drizzle and are the ONLY schema-change mechanism
 *   (generate → review → migrate). Never `db push` against shared databases.
 * - Connection: DATABASE_URL (override with DRIZZLE_DATABASE_URL for running
 *   the same migrations against a different disposable database).
 */

const connectionString =
  process.env.DRIZZLE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'drizzle.config.ts: DATABASE_URL (or DRIZZLE_DATABASE_URL) is required.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: connectionString,
  },
});
