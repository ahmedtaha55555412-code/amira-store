/**
 * Amira Store — persistent local verification PostgreSQL (PHASE-11).
 *
 * Boots the `embedded-postgres` devDependency as a LONG-LIVED disposable
 * instance (the documented local verification path: no Docker, no root, no
 * cloud) and prepares a fully-migrated + bootstrapped + seeded database for
 * the PHASE-11 verification round (dev server, verify:seo, the service
 * suites). Nothing on any real environment is touched.
 *
 * Run: node scripts/boot-verify-pg.mjs   (idempotent; prints the DATABASE_URL)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const PORT = Number(process.env.VERIFY_PG_PORT ?? 55432);
const USER = 'amira_verify';
const PASSWORD = 'verify_only_local';
const DB = 'amira_phase11';
const dataDir = '/tmp/amira-verify-pg-data';

const marker = path.join(dataDir, '.bootstrapped-phase11');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

async function main() {
  if (!fs.existsSync(marker)) {
    console.log('[boot-verify-pg] initialising fresh cluster…');
    await pg.initialise();
    fs.writeFileSync(marker, 'bootstrapped');
  }
  console.log('[boot-verify-pg] starting postgres…');
  await pg.start();

  // Create the role/database idempotently (CREATE vs ALTER noise is fine).
  try {
    await pg.createDatabase(DB);
    console.log(`[boot-verify-pg] database ${DB} created`);
  } catch {
    console.log(`[boot-verify-pg] database ${DB} already exists`);
  }

  const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}`;
  console.log(`[boot-verify-pg] READY`);
  console.log(`[boot-verify-pg] DATABASE_URL=${url}`);
  console.log('[boot-verify-pg] next: bun run db:migrate && bun run db:bootstrap && bun run db:seed');
  console.log('[boot-verify-pg] (keep this process running — dev server + suites connect to it)');
}

main().catch((error) => {
  console.error('[boot-verify-pg] fatal:', error);
  process.exit(1);
});
