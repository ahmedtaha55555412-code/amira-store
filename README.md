# أميرة استور — Greenfield ZCode Execution Pack

هذا الإصدار مخصص لمشروع جديد بالكامل يبدأ من Workspace فارغ. لا يحتاج إلى أي Repository قديم.

ابدأ من `ZAI_GREENFIELD_BOOTSTRAP.md` ثم `AGENTS.md`.

# أميرة استور — AI Execution Plan

This package contains the complete gated execution system for the Amira Store project.

## Start here
1. `AGENTS.md`
2. `MASTER_PLAN.md`
3. `EXECUTION_STATUS.md`
4. `ZAI_BOOTSTRAP.md`
5. `docs/DATA_DICTIONARY.md`
6. `docs/DESIGN_SYSTEM.md`
7. `docs/ops/ERROR_PROTOCOL.md`
8. `docs/qa/TRACEABILITY.md`
9. `docs/qa/FINAL_ACCEPTANCE.md`
10. `docs/phases/PHASE-00.md` through `PHASE-15.md`

## Important execution design
The project is deliberately not encoded as one giant prompt. `AGENTS.md` is intentionally short and authoritative, while detailed requirements live in `MASTER_PLAN.md` and bounded phase files. The agent must execute exactly one phase at a time and stop after its gate passes.

## Production target
- GitHub: source control and CI.
- Neon: PostgreSQL database, migrations, isolated development/preview branches.
- Vercel: Preview and Production deployments.
- Vercel Blob: media storage.

## Owner-approved core rules
- Arabic only / RTL.
- Egypt / EGP.
- Women's, men's, children's, baby, cosmetics.
- COD only.
- Shipping is finalized through WhatsApp.
- Customer checkout needs name + phone + one simple address field.
- Customer has no account.
- Admin is one username/password account; no register/create-admin/forgot-password/email recovery.
- Stock decrements immediately on successful order creation.
- Order tracking is order number + checkout phone.
- Product variants are generic and size is not forced to color.
- Variant-level original/current price, stock, SKU, and images.
- New Arrivals uses actual product creation date.
- No brands, coupons, best sellers, featured/selected products, or algorithmic product picks.
- Reviews include on-site reviews plus admin-managed WhatsApp testimonials.
- Logo is original and replaceable later.

## Application repository baseline (PHASE_00)
This repository is the Amira Store **application** repository. The planning pack above is preserved in-repo as the binding specification.

- Application: Next.js (App Router) + TypeScript strict + Tailwind CSS (sandbox scaffold baseline).
- Runtime/package manager in the execution environment: Bun (scripts documented in `docs/ops/BASELINE.md`).
- Database direction per MASTER_PLAN §25: PostgreSQL on Neon with Drizzle ORM — introduced in PHASE_02.
- Environment contract: `.env.example` (names only; real values only in platform secret stores).
- Baseline tooling/auth verification and environment decisions: `docs/ops/BASELINE.md`.
- Execution state: see `EXECUTION_STATUS.md`.

## Operations (PHASE-14)

- Deployment, CI contract, branch-protection status, preview workflow, and rollback/recovery: `docs/ops/DEPLOYMENT_RUNBOOK.md`
- Infrastructure baseline (GitHub/Vercel/Neon identities, environment-variable contract): `docs/ops/BASELINE.md`
- Database topology, migration policy, credential re-provision protocol: `docs/ops/DATABASE.md`
- CI: `.github/workflows/ci.yml` — check name "verify" (frozen-lockfile install → typecheck → lint → build); regression suites run per phase gate on a disposable database (`bun run verify:phase14` verifies the infrastructure contracts offline).
- Never commit secrets: `.env*` ignored except `.env.example` (names only); the credential vault lives in the git-ignored `.auth/`.

## Operator quick reference (PHASE-15 handoff)

All commands run from the repository root with [Bun](https://bun.sh) 1.3.x. Real values only
in git-ignored `.env`/`.env.local` (names in `.env.example`); production secrets live in the
platform stores (Vercel environment variables + Vercel↔Neon integration).

```bash
bun install --frozen-lockfile     # exact dependency install (lockfile is the contract)

# --- Environment (names → .env.example; values → git-ignored files / platform stores) ---
# DATABASE_URL          PostgreSQL (Neon) pooled endpoint; migrations use the DIRECT endpoint
# AUTH_SESSION_SECRET   strong per-environment secret (sessions + IP hashing)
# APP_URL               http://localhost:3000 locally; the deployment origin in the cloud
# Blob auth             OIDC pair injected by Vercel in the runtime; local runs re-provision
#                       per docs/ops/DATABASE.md §9.3/§9.6 (owner-authorized token vault)

# --- Database (PostgreSQL/Neon + Drizzle; migrations are the ONLY schema mechanism) ---
bun run db:migrate          # apply committed migrations (never `db push` outside disposable dev)
bun run db:bootstrap        # production-safe absent-only init: settings + 5 categories + homepage sections
bun run db:seed             # DETERMINISTIC demo catalog — development targets ONLY, never production
bun run db:bootstrap:admin  # one-time single-admin bootstrap (operator-provided env values; refuses if an admin exists)
bun run db:verify:local     # fresh disposable-DB proof: migrations + seed idempotency + 29 invariant probes

# --- Quality gates ---
bun run typecheck && bun run lint && bun run build
bun run verify:phase14      # offline infrastructure-contract suite (43 checks)
bun run verify:e2e          # golden commerce journey (with a disposable DB + dev server running)
#   full suite list: db:verify, verify:{auth,catalog,storefront,cart,checkout,orders,
#   admin,reviews,homepage,tracking,security,concurrency,seo,phase13,e2e,phase14}
#   (Blob suites require real Blob credentials and refuse honestly without them)

# --- Run / deploy ---
bun run dev                 # local dev server on :3000
# Deployment: push to `main` (CI "verify" must be green) → Vercel Git integration builds
# Production; non-main branches get SSO-protected Previews. Release/migration/rollback:
# follow docs/ops/DEPLOYMENT_RUNBOOK.md (forward-only migrations; rollback = deployment
# promote, never schema downgrade). Production bring-up procedures: docs/ops/DATABASE.md §13–§15.
```
