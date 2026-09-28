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
bun run verify:auth        # PHASE-03 auth/security suite (44 checks; non-prod only)
bun run verify:catalog     # PHASE-04 catalog/media service suite (43 checks; non-prod only)
bun run verify:storefront  # PHASE-05 storefront/search suite (101 checks; non-prod only)
bun run db:verify:local    # full disposable-PG rehearsal: fresh DB → migrate → bootstrap →
                           # seed (×2, idempotency) → guard check → 28 invariant probes
```

`drizzle.config.ts` reads `DRIZZLE_DATABASE_URL ?? DATABASE_URL`, so migrations can be
aimed at any disposable database without touching `.env`.

> **Dev-server restart protocol (ISSUE-2026-09-27-025):** always start the app with the
> git-ignored `.env.local` sourced (`set -a; . ./.env.local; set +a; bun run dev`) —
> the sandbox shell may carry a scaffold-era local `DATABASE_URL` that, via Next's
> process-env precedence, would otherwise shadow the development-branch URL.

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

## 8. Live-Neon application — EXECUTED and PASSED (2026-09-27)

The sandbox credential vault had been wiped (ISSUE-2026-09-27-018); Vercel access was restored
this session via the **Vercel OAuth device flow** (owner approved in browser; the CLI's background
poller kept being killed by sandbox recycling, so the RFC-8628 flow was driven manually — the
device code was displayed, and the token/refresh token were never printed and were shredded after
use). Neon itself was never logged into and needs no Neon API key: the already-configured
Vercel↔Neon integration supplied the per-environment connection secrets via `vercel env pull`
(values compared by hash only, never displayed).

**Topology fact discovered (recorded as ISSUE-2026-09-27-019):** on this Vercel↔Neon integration
the `development` and `production` environments carry the IDENTICAL `DATABASE_URL` — one database
(`neondb`) on the primary branch; isolated copy-on-write branches exist only per Preview
Deployment. Migrating the "development" target would therefore have modified the production
database — forbidden. The compliant disposable target was a temporary **database** on the same
Neon project (`phase02_drizzle_verify_tmp`, created with `CREATE DATABASE`); `neondb` itself and
its platform-managed `neon_auth` schema were never touched.

Executed procedure (all against real Neon, PostgreSQL 18.6, region fra1):

1. Pre-flight: `neondb` public tables = `[]` (only the platform `neon_auth` schema present).
2. `CREATE DATABASE phase02_drizzle_verify_tmp` → verified EMPTY (0 user tables).
3. `drizzle-kit migrate` with `DRIZZLE_DATABASE_URL` aimed at the temp database over the direct
   (unpooled) endpoint → `[✓] migrations applied successfully!` (exit 0). No `db push` anywhere.
4. Verification vs `drizzle/meta/0000_snapshot.json`: **23/23 tables, 9/9 enums — no missing, no
   extra**; `drizzle.__drizzle_migrations` contains exactly one row whose hash `a2a86f8b326955fc…`
   equals `sha256(drizzle/0000_init_schema.sql)` — the applied migration IS the exact committed
   file; 83 indexes / 34 FK / 34 CHECK constraints present on the public schema.
5. Smoke through the application's own driver path (`src/db/client.ts`, pooled endpoint):
   `select version()` → PostgreSQL 18.6 (Neon); `BEGIN; INSERT INTO store_settings …; ROLLBACK`
   → row visible inside the transaction (1), **0 rows after rollback** — write path proven,
   nothing persisted.
6. Cleanup: `DROP DATABASE phase02_drizzle_verify_tmp` → no longer listed (zero residue);
   final `neondb` snapshot unchanged (public tables still `[]`; the same 9 platform `neon_auth`
   tables before and after) — **the production database was not modified**.

Intentionally NOT done: no seed/bootstrap on any Neon database (dev seed is development-only;
SEED_PLAN forbids demo data outside development); no schema/data change to `neondb` — the real
application databases are migrated at deploy time per the deployment runbook.

## 9. Environment isolation — verified topology, integration limitation, remediation path (2026-09-27, pre-PHASE_03 safety round)

Owner directive: Development must never point at Production; preferred architecture is
Production → `main` Neon branch, Development → dedicated development Neon branch, Preview →
isolated per-deployment branches — all inside the existing `neon-cobalt-globe` resource
(Neon project `tiny-mud-82763154`). No second project; no rename/delete.

### 9.1 Verified current topology (hash-only fingerprints, no secrets)

| Vercel environment | Neon target (resolved via `vercel env pull`) | Fingerprint |
|---|---|---|
| `production` | `neondb` on the primary (main) branch, `tiny-mud-82763154`, fra1 | sha256 `a77fc2afd8ac2bd7…` |
| `development` | **IDENTICAL to production** | sha256 `a77fc2afd8ac2bd7…` (equal) |
| `preview` | isolated copy-on-write branch per Preview Deployment (integration-native, auto-created/deleted) | n/a (ephemeral) |

Preview isolation is already satisfied by the integration's product-inherent preview branching
(official Neon Vercel-native integration docs, cross-checked in PHASE_00). The gap is exactly one
binding: `development`.

### 9.2 Exact limitation (why the binding cannot be changed through the current configuration)

1. **The 18 `DATABASE_*` variables are integration-store secrets, not user variables.** Their
   values are ciphertext envelopes to a user token (`decrypt=true` returns ciphertext — proven
   PHASE_00); they jointly target `[development, preview, production]` as single entries and are
   owned by the Neon marketplace installation (`icfg_XaLDAPAdjX8ajtYn8mL9vC0a`). Rebinding one
   environment selectively is not an operation the public Vercel API exposes for
   marketplace-managed variables; hand-editing or shadowing them would desynchronize the
   integration that supplies the production binding and the preview predeploy actions.
2. **Creating a Neon branch is a control-plane operation.** The Vercel↔Neon integration exposes
   no public API for branch creation or per-environment branch mapping (installation endpoints
   probed in PHASE_00: read-only listing only; 403/404 on everything else). Branch creation
   requires the Neon console (owner browser) or a Neon API key (owner-issued). Neither exists in
   the sandbox, and secrets must never pass through chat.
3. **A same-branch extra database is NOT an acceptable substitute.** `CREATE DATABASE` on the
   main branch (the mechanism legitimately used for the one-shot PHASE-02 verification target)
   shares the primary branch's compute endpoint and storage lineage — it provides database-name
   isolation only, never the branch-level isolation the owner's architecture requires. It is a
   disposable-verification tool, not a development environment.

Per the owner directive, no workaround was invented and Production was left untouched.

### 9.3 Concrete safe remediation path (owner-paced; agent-verifiable)

> **Owner-side isolation gate (2026-09-27):** the agent's final control-plane re-check enumerated every
> available credential path — Vercel CLI **logged out** (no token, auth file absent), **no Neon CLI /
> API key / config anywhere in the sandbox**, only the GitHub credential is live. Neon branch creation
> is a control-plane operation reachable only through the Neon console or an owner-issued API key.
> Per the standing directive (no API workarounds), **nothing was created or modified** and ISSUE-019
> remains OPEN. The exact owner walkthrough follows.

**Step 1 — create the branch (owner, Neon console, ~1 minute):**
1. Sign in at `console.neon.tech` (owner account; org `org-frosty-darkness-82889078` was recorded at
   Marketplace install).
2. Open the project with ID **`tiny-mud-82763154`** (URL pattern
   `console.neon.tech/app/projects/tiny-mud-82763154`; match by ID, not display name).
3. Sidebar → **Branches** → **Create branch** (button may read "Create branch" / "New branch").
4. Fields:
   - **Branch name**: `development`
   - **Based on / parent**: `main` (the current primary branch — leave the default)
   - Keep the **copy data** default (copy-on-write snapshot of `main`; do NOT pick a schema-less/
     empty variant if offered — development should start from production's schema)
   - **Compute/endpoint**: keep enabled, Free-plan default size, region inherited (fra1)
5. Click **Create** → branch `development` gets its own endpoint `ep-…` (distinct from main's).
6. **Connect** → toggle **Pooled connection** → copy the string ONLY into a local git-ignored
   `.env.local`. Never into chat, the repo, or any tracked file.

**Step 2 — bind the development environment (owner, Vercel dashboard):**
1. Vercel → `amira-store` → **Storage** → **neon-cobalt-globe** → open its **Settings/Edit** view.
2. Look for a **per-environment** mapping control (environment selector, "Development branch", or
   per-environment connection settings offered by the integration).
   - **CRITICAL GUARDRAIL:** if the only control offered is a **single branch selector for the whole
     connected project, do NOT use it** — it would rebind *all* environments including Production.
     Production must remain on `main` unconditionally.
3. If a per-environment mapping exists → map **development → `development`**; the integration rewrites
   the development value itself (fully supported path).
4. If NO per-environment mapping exists on this Free-plan resource (the expected case): use **(a)** or
   **(b)** below — nothing else.
   - **(a) Compensating control (recommended — zero integration risk):** keep the integration binding
     as-is; treat the Vercel `development` environment as production-equivalent from this document
     onward: **never** run `db:migrate`/`db:seed`/any write through a pulled development
     `DATABASE_URL`. Local development instead uses a git-ignored `.env.local` whose `DATABASE_URL`
     is the `development` branch's **pooled** connection string copied in Step 1.6 — so all local
     schema/seed work lands on the isolated branch, while deploys reach production only through
     committed migrations at build time.
   - **(b) Manual per-environment management (owner decision only; NOT executed by the agent):**
     replace the integration-managed binding with explicit per-environment variables
     (production → main pooled; development → `development` branch pooled). Documented tradeoff:
     this forfeits the integration-managed preview branching/predeploy wiring unless the
     integration stays attached for preview only, which is not a supported configuration. Do not
     choose (b) without accepting those tradeoffs in writing.

**Step 3 — verification after ANY binding change (hash-only; agent-runnable next cycle via a one-shot
Vercel device flow, or owner-runnable):**
```bash
vercel env pull /tmp/env.production --environment=production && \
vercel env pull /tmp/env.development --environment=development
# then, WITHOUT printing values:
#   sha256(DATABASE_URL.production) MUST equal the recorded pre-change fingerprint
#     a77fc2afd8ac2bd7…  → production unchanged
#   sha256(DATABASE_URL.development) MUST differ from it → development isolated
#   URL host part (endpoint id, non-secret) of development MUST differ from production's
#     (different ep-… ids = different branches)
#   preview: unchanged (integration-native per-deployment branches)
```
Fail any check ⇒ revert the binding change; production state is the invariant.

### 9.4 Standing guardrails (effective immediately, until Step 2/3 lands)

- The Vercel `development` environment is **production-equivalent**: no migrations, no seed,
  no application writes through it. Disposable targets remain temporary databases (or, once it
  exists, the `development` branch) on `tiny-mud-82763154`.
- `drizzle-kit push` stays forbidden everywhere; the only schema mechanism is a committed
  migration applied by `drizzle-kit migrate`.
- No secret value is ever printed, logged, or committed; only hashes and host/endpoint
  identifiers are quotable.

### 9.5 Binding-capability verdict — first-party research round (2026-09-27, owner directive)

Owner created the isolated **`development`** branch in the Neon console (child of `main`, project
`tiny-mud-82763154` / resource `neon-cobalt-globe`; branches now: `main` = default/production,
`development` = new child, `preview/phase-00/bootstrap-preview` = existing Vercel preview branch)
and directed a docs/UI/API-only determination of whether the Vercel `development` environment can
safely receive the connection credentials of that existing branch. **Research-only round: zero
mutations** (no Vercel/Neon changes, no reconnect/reinstall, no env overwrites, no connections).

Findings (first-party sources only):

1. **Vercel side has no per-environment branch control.** The resource settings expose only
   Allowed Environments (All / Production-only) and an Update Configuration with no branch
   selector (owner UI inspection, this round). The 18 `DATABASE_*` variables are
   integration-managed store secrets (ciphertext — proven PHASE_00) and are not hand-editable;
   manual overwrite is also forbidden by owner policy. Independent user reports hit the same
   lock (Vercel Community, "Map environments to Neon branches", Oct 2025).
2. **Neon side — exactly one documented per-environment Development binding exists** for our
   integration type (Neon-Managed / Connectable Account;
   neon.com/docs/guides/neon-managed-vercel-integration): the **installation-time** option
   "**Create a branch for your development environment**" creates a persistent
   integration-managed branch named **`vercel-dev`** (clone of the default branch) **and sets
   the Vercel development environment variables for it**. Two hard nuances:
   - it binds its OWN `vercel-dev` branch — **no documented mechanism binds an arbitrary
     existing branch** (such as our `development`) to the Vercel `development` environment;
   - it is documented as an installation option only; the post-install "Managing the
     integration" surface (Settings = variable selection + role; Branches = preview cleanup;
     Disconnect) documents **no later toggle**. Enabling it on the existing installation would
     require a disconnect/reinstall — explicitly forbidden by the owner this round.
   (The sibling Vercel-Managed/"Native" integration is a different product — billing in Vercel /
   Lakebase — and documents no Development-branch binding at all.)
3. **Verdict: NO supported binding exists today, under the owner's stated constraints, between
   the Vercel `development` environment and the existing Neon `development` branch.** Per the
   owner's conditional, the integration is LEFT UNTOUCHED and ISSUE-2026-09-27-019 stays OPEN.

Operative development architecture (unchanged — §9.3 Step 2(a) compensating control):

- Local development uses the git-ignored `.env.local` whose `DATABASE_URL` is the
  `development` branch's **pooled** connection string (owner copies it from Neon Console →
  Connect, branch `development`). All local schema/seed work lands on the isolated branch.
- The Vercel `development` environment stays **production-equivalent and WRITE-PROHIBITED**;
  `vercel env pull` output must never be used as the `DATABASE_URL` for local schema/seed work.
- Deploys reach production only through committed migrations at build time; preview stays
  integration-isolated (unchanged).

Recorded future option (owner decision ONLY — not executed; blocked this round by the
no-reinstall directive): enable the documented `vercel-dev` mechanism. If ever pursued:
(i) first read-check Neon Console → Integrations → Vercel → Manage → Settings for a
development-branch toggle (if present, enabling it touches Development only per the docs);
(ii) otherwise a reconnect/reinstall with the SAME Neon project `tiny-mud-82763154`, database
`neondb`, and role, with the option enabled — and the §9.3 Step 3 hash-only verification
(production fingerprint MUST stay `a77fc2afd8ac2bd7…`) is the mandatory gate;
(iii) `development` and `vercel-dev` would then be redundant — keep/delete is the owner's call
(the branch is not production).

### 9.6 Binding RESOLVED — per-environment override (2026-09-28, final pre-PHASE-08 closure)

Owner directive: fix the Vercel Environment configuration (Production → Neon main,
Development → Neon development, Preview → isolated per contract). The §9.5 "no supported
binding" verdict described the integration-UI surface only; the owner's 2026-09-28 directive
sanctioned control-plane **target surgery**, which was executed WITHOUT any value change and
WITHOUT reinstall:

1. Integration `DATABASE_URL` (`mnk1KV5UjdrPX9QK`, store `neon-cobalt-globe`) target narrowed
   `[development, preview, production]` → `[preview, production]` via `PATCH …/env/{id}` with
   NO `value` in the body (credential byte-unchanged). Production fingerprint re-pulled
   immediately after: `a77fc2afd8ac2bd7…` UNCHANGED (fail-fast gate).
2. Project-level `DATABASE_URL` (`lGK9GdoX5H9pBtcB`, type `encrypted`) created for target
   `[development]` only, value = the development-branch POOLED string already sanctioned in
   git-ignored `.env.local` (endpoint `ep-dark-boat-b1fejsk4`). Direct creation before step 1
   was refused (`ENV_CONFLICT`) — evidence recorded, not bypassed.

**Operative topology (hash-only fingerprints):**

| Vercel environment | Resolves to | Endpoint | Fingerprint |
|---|---|---|---|
| production | integration var → Neon `main` | `ep-cool-art-b1snfj5i-pooler` | `a77fc2afd8ac2bd7…` (invariant) |
| preview | integration var (static fallback; per-deployment isolated-branch injection unchanged) | `ep-cool-art-b1snfj5i-pooler` | `a77fc2afd8ac2bd7…` |
| development | project var → Neon `development` | `ep-dark-boat-b1fejsk4-pooler` | `f5aa1006670416a5…` (≠ production) |

**Verification protocol (repeat after ANY future change):**
```bash
vercel env pull /tmp/env.production --environment=production
vercel env pull /tmp/env.development --environment=development
# hash-only: sha256(DATABASE_URL.production) MUST equal a77fc2afd8ac2bd7…
# sha256(DATABASE_URL.development) MUST differ + host MUST be ep-dark-boat-b1fejsk4-pooler.*
# then a disposable create/insert/select/delete/drop probe and a production byte-baseline compare
```
2026-09-28 runtime proof: app started with the PULLED Development env served development data
(production has 0 products — decisive discriminator); disposable write/read/delete 7/7 on
`ep-dark-boat` with zero residue; production DB byte-identical to its pre-change baseline after
all changes. Development-target variables do not affect deployments, so no redeploy was required.

§9.4 guardrail update: the first bullet ("Vercel development environment is
production-equivalent — write-prohibited") is **SUPERSEDED**: that environment now resolves to
the disposable `development` branch. Neon `main` remains production and stays write-prohibited
outside the documented release procedure (§13).

## 10. Development-branch bring-up for PHASE_03 (2026-09-27) — compensating control LIVE

The owner authorized the `development` branch's POOLED connection string for the sandbox and
delegated creation of the git-ignored `.env.local`. The verification chain mandated by §9.3
Step 3 / ISSUE-2026-09-27-020 ran BEFORE any use, with values never displayed:

1. `.env.local` is git-ignored (`git check-ignore` ✓; `git status` clean; chmod 600).
2. URL is a `*.neon.tech` POOLED host; endpoint id `ep-dark-boat-b1fejsk4` (branch `development`).
3. **sha256(DATABASE_URL) = `e5d2abaf3816965f…` ≠ the recorded production fingerprint
   `a77fc2afd8ac2bd7…`** — not the Production URL (hash-only protocol; no production endpoint
   id was ever recorded, so fingerprint inequality is the operative discriminator, combined
   with the owner's attestation that the string came from the `development` Connect panel).
4. Read-only probe: `neondb` @ PostgreSQL 18.6 (fra1), **0 public tables**, only the platform
   `neon_auth` schema — a fresh copy-on-write child of `main`, exactly matching §8's final
   production snapshot.

Executed bring-up (every command explicitly aimed via sourced `.env.local` — bun does not
auto-load `.env*` in this sandbox):

- `drizzle-kit migrate` with `DRIZZLE_DATABASE_URL` = the **direct** endpoint of the SAME
  endpoint id (standard Neon derivation: host minus the `-pooler` infix) per §5 policy →
  23/23 tables + 9/9 enums; `__drizzle_migrations` hash == sha256(`drizzle/0000_init_schema.sql`)
  (`a2a86f8b…`). No `db push` anywhere.
- `db:bootstrap` (production-safe, absent-only) → settings singleton + 5 categories.
- `db:seed` (development-only by code) → deterministic demo catalog.
- `db:verify` → **28/28 invariant probes PASS** on the real Neon development branch.
- `db:bootstrap:admin` (new PHASE-03 CLI, §3) → single QA admin `amira_admin`; second run
  REFUSES (first-admin-only guard).
- `verify:auth` (new PHASE-03 suite) → **29/29**.

Standing state after this round:

- Local development DB = Neon `development` branch via `.env.local` (pooled for the app
  runtime; direct for migrations). The Vercel `development` environment remains
  production-equivalent and WRITE-PROHIBITED (§9.4) — that binding gap stays tracked as
  ISSUE-2026-09-27-019.
- Production (`main` branch) was never connected to during this round; its fingerprint
  record (`a77fc2afd8ac2bd7…`) remains the invariant to re-check after any future binding
  change (§9.3 Step 3).

## 11. PHASE_05 migration — 0001_storefront_search (2026-09-27)

The only schema-layer change of PHASE-05 (no table changes): `CREATE EXTENSION IF NOT EXISTS
pg_trgm;` + six trigram GIN indexes backing the storefront's typo-tolerant (fuzzy) search tier —
`products.name`, `products.short_description`, `products.description`, `product_variants.sku`,
`attribute_values.value`, `categories.name`. This fulfills the PHASE_02 baseline note in §6
("PHASE-05 adds it only if it provides measurable search value on Neon"): the fuzzy tier
(`strict_word_similarity` ≥ 0.35, threshold set after measuring the noise floor) is only
practical with trigram support. Applied to the Neon `development` branch via
`drizzle-kit migrate` with the §5 direct-endpoint derivation (`__drizzle_migrations` = 2/2;
`pg_trgm` present; all six indexes verified). Exact/prefix/substring tiers do NOT use these
indexes: they match through the Arabic-aware `translate()` normalization expression
(`src/lib/storefront/arabic.ts`) — expression indexes are deferred to PHASE_11 performance.

Seed note (same phase): demo media assets now carry DISTINCT per-product placeholder URLs
(`/brand/demo/<slug>.svg`, dev-only) so the storefront's variant-image switching is visually
verifiable in development QA; the upsert is re-run safe and demo rows remain clearly marked.

## 12. PHASE_06 schema note + rehearsal-locale lesson (2026-09-27)

- **PHASE-06 introduces NO schema change** — by design: the guest cart and
  wishlist are durable CLIENT state (versioned localStorage documents,
  `amira.cart.v1` / `amira.wishlist.v1`), and the one new endpoint
  (`/api/storefront/cart-availability`) is READ-ONLY. The binding
  revalidation of price/stock remains the PHASE-07 order-creation
  transaction (MASTER_PLAN §10). No migration; `__drizzle_migrations`
  stays 2/2.
- **Disposable-rehearsal locale requirement:** an embedded/local PostgreSQL
  rehearsal cluster must be initialized with a UTF-8 ctype that classifies
  Arabic as word characters (`--locale=C.UTF-8`), or `pg_trgm` extracts ZERO
  trigrams from Arabic strings and the migration-0001 fuzzy tier silently
  fails (`strict_word_similarity(...) = 0`). Neon's managed clusters are
  UTF-8 by default — this only affects disposable local rehearsals.
  Verified: similarity('مرطاب','مرطب') = 0 under `C`, 0.375 under `C.utf8`.
## 13. PRODUCTION bring-up — committed migrations applied to Neon `main` (2026-09-28, owner-authorized)

Owner directive (2026-09-28): the confirmed root cause of the Production runtime 500s
(ISSUE-2026-09-28-038 — Neon Production `main` has no application schema; runtime logs
reproduced `GET /` → PostgreSQL `42P01 relation "categories" does not exist`, digest
`2975296465`) authorized the bring-up of the EXISTING Production database by the
DEPLOYMENT_RUNBOOK release procedure ONLY: committed Drizzle migrations (+ the
production-safe `db:bootstrap` where the runbook requires it). Explicitly forbidden and
NOT done: `db:seed`, demo products, fake customers/orders/reviews, any reset/drop/
truncate, any touch of the `neon_auth` platform schema, any change to the Vercel↔Neon
integration binding, PHASE-07 work.

### 13.1 Pre-change evidence (verified BEFORE any mutation)

Repository / canonical migration state:

- GitHub `main` is the source of truth; the deployed Production commit `70dd015`
  (deployment `dpl_FSR9p4A54Gs6`, READY; CI run 36387648285 GREEN) differs from HEAD
  only by docs (`git diff 70dd015..HEAD` = EXECUTION_STATUS.md + worklog.md).
- Committed migrations = exactly two files (journal `drizzle/meta/_journal.json`):
  `0000_init_schema.sql` sha256 `a2a86f8b326955fc…` and `0001_storefront_search.sql`
  sha256 `bb29d309a181e22d…`. No uncommitted schema changes; CI has no build-time
  migration step (typecheck → lint → build), so Production migration is an explicit
  out-of-band release action — exactly the runbook's step 4.
- Expected post-migration shape measured THIS session on a disposable embedded
  PostgreSQL rehearsal (same machine, same committed migration files, same
  `drizzle-kit migrate` mechanism, UTF-8 ctype per §12): **23 tables, 9 enums,
  89 indexes, 34 FK constraints, 34 CHECK constraints, 6 trigram GIN indexes,
  extensions {pg_trgm, plpgsql}, `__drizzle_migrations` = 2 rows with hashes equal to
  the two files' sha256s.** Production must match this profile exactly.
- Target-identity gates (hash-only protocol, §9.4): the production connection string
  pulled from the Vercel↔Neon integration must hash to `a77fc2afd8ac2bd7…` (§9.1
  record) and its endpoint id must differ from the isolated development branch's
  `ep-dark-boat-b1fejsk4` (whose fingerprint `e5d2abaf3816965f…` must NOT match).
- Live pre-mutation snapshot (this round, BEFORE `drizzle-kit migrate`; read-only probes
  against the pooled→direct-derived endpoint `ep-cool-art-b1snfj5i.c-5.eu-central-1.aws.neon.tech`,
  database `neondb`, user `neondb_owner`, PostgreSQL 18.6): public schema = **0 tables,
  0 enums, 0 indexes, 0 FK/CHECK constraints**; `neon_auth` platform schema present with
  its 9 tables (account, invitation, jwks, member, organization, project_config, session,
  user, verification) — untouched by this procedure; `drizzle` schema ABSENT
  (`drizzle.__drizzle_migrations` does not exist); extensions = {plpgsql} only.
  Connection fingerprints: pooled `sha256=a77fc2afd8ac2bd7…` (== §9.1 production record),
  direct-derived URL hashed separately in-session; endpoint id `ep-cool-art-b1snfj5i` ≠
  development's `ep-dark-boat-b1fejsk4`; development fingerprint `e5d2abaf3816965f…` NOT
  matched. One transient first-connection drop (Neon free-compute cold start) was retried
  transparently by the driver pool; all probes then completed.
- Second-Neon-resource check (Vercel API, read-only): exactly ONE project (`amira-store`,
  `prj_jaEPtjMP1YvTGaynt9LaHXzxcTFA`); storage store `neon-cobalt-globe`
  (`store_Xot2tvwkL5JACcF7`) is the ONLY connected resource (projectsMetadata binds the
  project, envVarPrefix DATABASE, 18 `DATABASE_*` variables, environments
  development/preview/production). One additional UNBOUND store named `amira-store`
  (`store_dqlFkjRT5Qe6XRyB`) exists with `projectsMetadata: []` and supplies ZERO
  environment variables — an inert leftover of the integration install flow, not a second
  live database binding; flagged for owner-side cleanup (deletion is a mutation outside
  this round's authorization).

### 13.2 Mutation record (what actually ran, in order)

1. `drizzle-kit migrate` with `DRIZZLE_DATABASE_URL` = the production DIRECT endpoint
   (`ep-cool-art-b1snfj5i.c-5.eu-central-1.aws.neon.tech`, derived from the integration's
   pooled production URL by removing the `-pooler` infix, per §5 policy) →
   **`[✓] migrations applied successfully!`** — applied the two committed migrations
   `0000_init_schema` + `0001_storefront_search`. No `db push` anywhere; no data statements.
2. `bun run db:bootstrap` with `DATABASE_URL` = the production POOLED URL (the script's
   own driver path) → `connectivity ✔` / `migrations current ✔ (2 applied)` /
   `store_settings ✔ (absent-only)` / `five main categories ✔ (absent-only)` /
   `DONE — products/orders/customers/inventory untouched.` Both cold-start connection
   transients were retried transparently by the driver pool (documented free-tier behavior).

### 13.3 Post-migration verification (read-only probes, direct endpoint)

- `drizzle.__drizzle_migrations` = **2 rows**: id 1 hash `a2a86f8b326955fc…`,
  id 2 hash `bb29d309a181e22d…` — each byte-equal to `sha256` of the corresponding
  committed migration file (verified in-process).
- Schema profile **matches the §13.1 rehearsal expectation EXACTLY**: 23/23 tables
  (name-for-name identical), 9/9 enums, 89/89 indexes, 34/34 FK constraints, 34/34
  CHECK constraints, 6/6 trigram GIN indexes, extensions {pg_trgm, plpgsql}.
- `neon_auth` platform schema untouched: 9 tables before and after.
- After bootstrap: `store_settings` = exactly 1 row (id 1); categories = exactly the
  5 documented bootstrap rows (نسائي، رجالي، أطفال، مواليد، مستحضرات تجميل);
  business counts all **0** (products, orders, customers, reviews, admin_users,
  media_assets, homepage_sections/banners, inventory_movements, whatsapp_testimonials,
  size_guides, attributes) — no demo data, per the owner directive.

### 13.4 Runtime verification (actual Vercel Production runtime)

- Serving deployment: `dpl_AEjjJDjyyA1Rnqa884wrbnP9y2WC` (READY, built from `5703066`,
  docs-only descendant of `70dd015` — `git diff 70dd015..5703066` = EXECUTION_STATUS.md +
  worklog.md; zero source delta). `dpl_FSR9p4A54Gs6` (`70dd015`) remains READY and intact
  in the deployment history. No source-code regression was introduced by this round.
- Live route re-test (production alias `amira-store-opal.vercel.app`): `GET /` → **200**
  (131 KB real render; was 500 with digest `2975296465`), `/robots.txt` 200,
  `/category/{women,men,cosmetics}` 200, `/search?q=شنط` 200, `/search?q=` 200,
  `/cart` 200, `/product/__no_such_product__` → streamed honest not-found state
  (`notFound()` + «غير موجود» UI), `/wishlist` → 404 (correct: wishlist is a drawer,
  not a page). Zero digests, zero `__next_error__` shells in ANY response.
- Fresh runtime log capture (live `vercel logs` streaming while re-hitting the routes,
  deployment `dpl_AEjjJDjyyA1Rnqa884wrbnP9y2WC`): digest `2975296465` **ABSENT**,
  `42P01`/`does not exist` **ABSENT**, **zero 5xx** (all logged responseStatusCodes 200).
  The only `level:"error"` lines are the known node-postgres SSL-mode deprecation
  WARNING emitted on stderr (upstream advisory, present since PHASE-02 on every
  environment; not an application error, not a 5xx).
- Production connectivity through the production runtime is thereby proven end-to-end:
  serverless requests on `amira-store-opal.vercel.app` executed live Neon queries over
  the integration-supplied production connection and returned real rendered pages.
- Credentials protocol: the production connection string existed only inside the
  pulled `/tmp` env file and process environments (chmod 600); it was never printed,
  logged, or committed; only sha256 prefixes and endpoint ids were recorded. All
  `/tmp` credential artifacts + device codes shredded after verification.
