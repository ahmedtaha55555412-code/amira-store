# Amira Store — Database Guide (PostgreSQL / Neon / Drizzle)

Since PHASE_02 the application data layer is **PostgreSQL on Neon with Drizzle ORM**.
SQLite and Prisma are removed (they were scaffold-era only). This document explains
the model, the commands, the safety rules, and every justified deviation recorded
against `docs/DATA_DICTIONARY.md`.

## 1. Source of truth

| Artifact | Role |
|---|---|
| `docs/DATA_DICTIONARY.md` | Logical model + implementation decisions (kept in sync) |
| `src/db/schema/*.ts` | Executable schema (single source of truth for DDL) |
| `drizzle/0000_*.sql` | Committed migrations — the ONLY schema-change mechanism |
| `MASTER_PLAN.md` §25/§26 | Database direction and proposed tables |

## 2. Schema map (23 tables, 9 enums)

- **Admin**: `admin_users`, `admin_sessions` (hashed tokens only), `admin_activity_logs`
- **Catalog**: `categories` (parent/child tree), `products`, `attributes`, `attribute_values`,
  `product_variants`, `variant_attribute_values`, `product_images`, `size_guides`, `size_guide_rows`
- **Media**: `media_assets` (provider-isolated registry; Vercel Blob is PHASE-04)
- **Commerce**: `customers` (guest, identity = normalized phone), `orders` (full snapshots),
  `order_items` (per-line price/attribute/SKU snapshots)
- **Inventory**: `inventory_movements` (append-only auditable ledger)
- **Social proof**: `reviews`, `review_images`, `whatsapp_testimonials` (two DISTINCT domains)
- **Content/settings**: `store_settings` (singleton), `homepage_sections`, `homepage_banners`

## 3. Commands

```bash
bun run db:generate        # drizzle-kit generate — create migration SQL from schema (review it!)
bun run db:migrate         # drizzle-kit migrate  — apply pending migrations (Neon-safe)
bun run db:studio          # drizzle-kit studio   — data browser
bun run db:bootstrap       # production-safe init: settings + 5 categories IF ABSENT (any env)
bun run db:seed            # DEV seed: deterministic demo catalog (NODE_ENV=development only)
bun run db:verify          # probes: migrations current + all business invariants (non-prod only)
bun run db:verify:local    # full disposable-PG rehearsal: fresh DB → migrate → bootstrap →
                           # seed (×2, idempotency) → guard check → 28 invariant probes
```

`drizzle.config.ts` reads `DRIZZLE_DATABASE_URL ?? DATABASE_URL`, so migrations can be
aimed at any disposable database without touching `.env`.

## 4. Rules (never break these)

1. **Migrations are the only schema mechanism.** `drizzle-kit push`/`db push` is forbidden
   against shared databases (MASTER_PLAN §25). Generate → review SQL → commit → migrate.
2. **Migration ordering trap (fixed in `0000_init_schema`):** the composite FK
   `variant_attribute_values(attribute_value_id, attribute_id)` requires
   `attribute_values_id_attribute_key` to exist FIRST; the index creation therefore sits
   directly after the `attribute_values` table, before the FK ALTERs (ISSUE-2026-09-27-015).
3. **Seed never runs outside development.** `scripts/db-seed.ts` hard-refuses
   `NODE_ENV !== 'development'` (DoD: seed works only in explicit dev/preview mode).
4. **Production bootstrap touches nothing existing.** `db-bootstrap` only fills ABSENT
   settings/categories; it never creates admin accounts, orders, or demo content, and it
   never prints credentials (SEED_PLAN).
5. **No secrets in Git.** `.env.example` documents names only.
6. **Transactions wrap every inventory-affecting mutation** (enforced by PHASE-07/08 code;
   the ledger + partial unique indexes make violations structurally impossible).

## 5. Neon ↔ local driver policy

One driver (`pg`) everywhere: app runtime, scripts, and drizzle-kit. Neon speaks standard
PostgreSQL wire protocol over TLS, so behavior verified on the disposable local rehearsal
PostgreSQL is exactly what runs on Neon. The driver choice is isolated in `src/db/client.ts`:

- **App on Vercel** → Neon **pooled** endpoint (`…-pooler…neon.tech`) — serverless functions
  open many short-lived connections; pooling prevents connection exhaustion on the free plan.
- **Migrations/scripts** → Neon **direct** endpoint.
- TLS is enabled automatically for non-local hosts (override with `sslmode` in the URL).
- If edge/serverless-driver support is ever needed, only `src/db/client.ts` changes.

## 6. Design decisions vs. DATA_DICTIONARY.md (all recorded there too)

| Decision | Rationale |
|---|---|
| `variant_attribute_values.attribute_id` denormalized + composite FK + `UNIQUE(variant_id, attribute_id)` | Enforces "one value per attribute per variant" at DB level — concurrency-safe for checkout/order-edit phases; size stays decoupled from color |
| `customers.phone_normalized` UNIQUE (not just indexed) | MASTER_PLAN §10 upsert-by-phone semantics; race-safe; order snapshots keep history independent |
| `orders.idempotency_key` partial-unique | Schema slot for the PHASE-07 duplicate-submit contract |
| `orders.grand_total = products_total + COALESCE(shipping_cost,0)` CHECK | Enforces MASTER_PLAN §11 totals flow end-to-end |
| `order_items.subtotal = unit_price × quantity` CHECK | Exact money identity (scale-2 × integer never rounds) |
| `order_items (order_id, variant_id)` UNIQUE | One line per variant per order; quantities merge |
| `inventory_movements` ledger CHECKs (`after = before + delta`, nonnegative) + partial-unique `cancellation_return` per order | "No negative stock" and "restore exactly once" become structural facts |
| `reviews` partial-unique verified review per order item | Dictionary rule "one review per order_item for verified reviews" |
| `product_images` partial unique primaries (product-level / variant-level) + media-uniqueness | Exactly-one-primary semantics; idempotent seeds |
| `store_settings` singleton (`id = 1` CHECK) | True single-row settings table |
| `products` soft-delete (`archived`), `order_items.product_id` NOT NULL RESTRICT | Dictionary's preferred policy; history stays referential |
| `products.canonical_slug` (not full URL) | Domain-independent SEO; URL built at render time |
| `pg_trgm` NOT included in initial migration | Portable baseline (task 10 allows optional); PHASE-05 adds it only if it provides measurable search value on Neon |
| `updated_at` app-maintained (no triggers) | Simpler migrations; all writes go through the app layer |

## 7. Verification evidence (PHASE_02)

`bun run db:verify:local` — disposable PostgreSQL 18 rehearsal (exit 0):

1. Fresh DB builds from **migrations alone** (`amira_migrate_check`).
2. Second fresh DB: migrate → production-safe bootstrap → dev seed → **both re-runs
   idempotent** (7 products / 18 variants / 24 assignments / 13 images stable) →
   seed **refuses** `NODE_ENV=production`.
3. **28/28 probes pass**: 9 positive verification scenarios (size-only, color-only,
   size+color non-Cartesian, no-attribute default variant, per-variant price/stock/image
   independence, multi-image products, New-Arrivals index) + 19 DB-enforced invariant
   rejections (unique SKU/slugs, no negative stock, positive prices, one value per
   attribute per variant, composite-FK pair consistency, order money identities, one
   verified review per order item, single cancellation-return per order, ledger
   identities, session-token uniqueness, settings singleton).

## 8. Live-Neon application procedure (pending credential restore — ISSUE-2026-09-27-018)

The sandbox recycle wiped the CLI credential vault, so the live-Neon half of the
verification is documented here as a ready-to-run procedure (no code work remaining):

1. Restore `gh` + `vercel` auth into `.auth/` (ISSUE-2026-09-26-009 mitigation), then
   `git push origin main` for the PHASE_02 commit.
2. Vercel Git integration builds the commit. The Vercel ↔ Neon integration injects
   `DATABASE_URL` (pooled, per-environment; preview gets an isolated copy-on-write branch).
3. One-off live checks (local machine or a Vercel-adjacent runner with the env vars):
   ```bash
   # direct endpoint for migrations
   DATABASE_URL="$NEON_DIRECT_URL" bun run db:migrate
   # pooled endpoint for the app runtime path
   DATABASE_URL="$NEON_POOLED_URL" bun -e "import('./src/db/client.js').then(async ({db}) => { console.log((await db.execute(require('drizzle-orm').sql\`select version()\`)).rows); })"
   ```
   Expected: migration applied on the Neon branch; `select version()` returns PostgreSQL
   (Neon). `bun run db:bootstrap` then initializes settings + 5 categories on non-dev
   environments exactly once (idempotent, absent-only).
4. CI (`verify` job: install → typecheck → lint → build) goes green on push — completing
   the same green path PHASE_00/01 used (last green: run 36300359549).

Nothing in the application or schema needs to change for this step.
