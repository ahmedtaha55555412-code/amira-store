/**
 * Amira Store — local disposable-database verification (PHASE-02).
 *
 * Proves, against a REAL throwaway PostgreSQL (no Docker, no root, no cloud):
 *  1. migrations apply cleanly to a fresh empty database (DoD #1);
 *  2. a second fresh database + production-safe bootstrap + dev seed works,
 *     and BOTH the bootstrap and the seed are idempotent (re-run safe);
 *  3. every PHASE-02 verification scenario and business invariant holds
 *     (scripts/verify-migrations.ts probes);
 *
 * The database is created in a temp dir and destroyed at the end — nothing on
 * any real environment is touched. Requires the `embedded-postgres` devDependency.
 *
 * Run: bun run db:verify:local   (≈30 s)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const PORT = Number(process.env.VERIFY_PG_PORT ?? 55432);
const USER = 'amira_verify';
const PASSWORD = 'verify_only_local';
const MIGRATE_DB = 'amira_migrate_check';
const SEED_DB = 'amira_seed_check';

const step = (m) => console.log(`\n=== ${m} ===`);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amira-verify-pg.'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: false,
});

let exitCode = 1;
try {
  step('Booting disposable PostgreSQL');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(MIGRATE_DB);
  await pg.createDatabase(SEED_DB);
  const version = execSync(
    `node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:'postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/postgres'});await c.connect();const r=await c.query('SHOW server_version');console.log(r.rows[0].server_version);await c.end();})()"`,
    { encoding: 'utf8', env: process.env },
  ).trim();
  console.log(`PostgreSQL ${version} ready on 127.0.0.1:${PORT}`);

  /* ------------------------------------------------------------------ */
  step('Test 1 — fresh database builds from migrations ALONE');
  execSync('bun run db:migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${MIGRATE_DB}` },
  });

  /* ------------------------------------------------------------------ */
  step('Test 2 — second fresh DB: migrations + bootstrap + seed (+ idempotency)');
  const seedDbUrl = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${SEED_DB}`;

  execSync('bun run db:migrate', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: seedDbUrl } });

  console.log('\n--- bootstrap (production-safe path, run #1) ---');
  execSync('bun run db:bootstrap', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: seedDbUrl } });

  console.log('\n--- development seed (run #1) ---');
  execSync('bun scripts/db-seed.ts', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: seedDbUrl, NODE_ENV: 'development' } });

  console.log('\n--- bootstrap re-run (must be a no-op) ---');
  execSync('bun run db:bootstrap', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: seedDbUrl } });

  console.log('\n--- development seed re-run (must not duplicate) ---');
  execSync('bun scripts/db-seed.ts', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: seedDbUrl, NODE_ENV: 'development' } });

  console.log('\n--- seed guard check (must REFUSE outside development) ---');
  let guardRefused = false;
  try {
    execSync('bun scripts/db-seed.ts', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: seedDbUrl, NODE_ENV: 'production' } });
  } catch {
    guardRefused = true;
  }
  if (!guardRefused) throw new Error('Seed guard failed: seed ran with NODE_ENV=production!');
  console.log('Seed correctly REFUSED with NODE_ENV=production ✔');

  /* ------------------------------------------------------------------ */
  step('Test 3 — verification scenarios + business invariants (probes)');
  execSync('bun run db:verify', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: seedDbUrl, NODE_ENV: 'development' } });

  exitCode = 0;
} catch (error) {
  console.error('\n[verify-local] FAILED:', error?.message ?? error);
  if (error?.stdout) console.error(String(error.stdout));
  if (error?.stderr) console.error(String(error.stderr));
} finally {
  step('Teardown');
  try {
    await pg.stop();
  } catch {}
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
  console.log(`Disposable database destroyed (${dataDir}).`);
}

process.exit(exitCode);
