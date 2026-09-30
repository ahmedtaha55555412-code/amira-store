# Deployment Runbook — Greenfield GitHub + Neon + Vercel

## Target topology
This is a NEW project. ZCode must create the GitHub repository, Neon project/database, and Vercel project from the authenticated owner accounts before production launch. GitHub repository is the source of truth.

- `main` → Production
- feature/fix branches → Preview
- Neon production branch → Production application
- Neon preview branches → isolated preview deployments when automation is enabled
- Vercel Blob → media storage

## Required repository files
- `.env.example`
- `.gitignore`
- `README.md`
- `drizzle.config.ts`
- `drizzle/` committed migrations
- `scripts/` for bootstrap/seed/verification
- `.github/workflows/ci.yml`
- optional preview database workflow if configured

## Environment categories
### Development
- DATABASE_URL
- AUTH/session secret
- app URL
- any Vercel Blob development credentials/config

### Preview
- isolated Neon branch connection
- preview app URL if needed
- non-production storage where appropriate

### Production
- Neon production connection
- production app URL/domain
- production Blob configuration
- strong auth/session secrets

Never commit actual values.

## Migration policy
1. Change Drizzle schema.
2. Run `drizzle-kit generate`.
3. Review generated SQL.
4. Test migration on disposable/Preview Neon branch.
5. Run migration checks.
6. Merge only after Preview verification.
7. Apply to Production according to release procedure.

Never use production `db push` as a schema workflow.

## Preview workflow
1. Create feature branch.
2. Push to GitHub.
3. Vercel creates Preview deployment.
4. Provision/attach matching Neon preview branch when the phase requires database changes.
5. Apply migrations to Preview.
6. Run automated tests.
7. Manual browser checks.
8. Merge only when all required checks are green.

## Production workflow
1. Main is green.
2. Required checks pass.
3. Production database backup/safety checks are completed.
4. Production migration is applied.
5. Vercel deploys the production branch.
6. Run smoke tests.
7. Monitor errors/logs.
8. If release is defective, roll back deployment and assess DB migration compatibility before rollback.

## Secrets
GitHub Actions secrets and Vercel environment variables are used for sensitive values. GitHub stores secrets encrypted and only exposes them to workflows that explicitly reference them. Use least-privilege credentials.

## Final smoke test
- Homepage
- Search
- Category
- Product/variant selection
- Cart
- Checkout
- Order creation
- Stock decrement
- Success page
- WhatsApp link
- Admin login
- Order edit
- Inventory
- Tracking
- Review
- Vercel production health

## Greenfield provisioning order
1. Authenticate GitHub and verify account identity.
2. Initialize Git and create the new repository.
3. Authenticate Neon and create the Amira Store database project/branch structure.
4. Authenticate Vercel and create/link the Amira Store project.
5. Configure non-secret environment variable names in the repository and real values in the appropriate platform secret/environment stores.
6. Prove a Preview deployment before any Production deployment.
7. Run final acceptance, then deploy Production.

Do not paste credentials into the ZCode chat or commit them to Git.

---

# PHASE-14 addendum — CI/CD + protection + rollback (2026-09-30)

## CI/CD contract (authoritative workflow: `.github/workflows/ci.yml`)

- Triggers: `push` → `main` only; `pull_request` → `main` only. (ISSUE-2026-09-30-069: the
  filter had been corrupted to `ain]` since the initial commit — GitHub failed open and ran
  CI on every branch; fixed and proven by trigger-matrix tests: a unique non-main push
  produces 0 workflow runs; a PR produces the `verify` run via the `pull_request` event.)
- Permissions: explicit workflow-level `permissions: contents: read` (least privilege; the
  repo default workflow permission is also `read`). No `id-token` — nothing in this repo
  consumes GitHub OIDC; deployments run through the Vercel Git integration, NOT GitHub Actions.
- Third-party actions are pinned to full commit SHAs: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`
  (v4 line) and `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6` (v2 line) —
  resolved via the GitHub API, source repos verified by owner name before pinning.
- Bun is pinned to `1.3.14` (the development runtime version) instead of floating `latest`.
- Mandatory CI steps: `bun install --frozen-lockfile` → `bun run typecheck` → `bun run lint`
  → `bun run build`. The check name is exactly **"verify"** (job id) — keep it unique; any
  future required-status-check configuration must reference this name.
- The deterministic `verify:*` regression suites require a disposable PostgreSQL and (for
  the HTTP suites) a running app server; they are the ENVIRONMENT-DEPENDENT verification
  layer and run per phase gate outside CI (latest evidence recorded in EXECUTION_STATUS.md).
  They are never weakened to pass a phase and never silently skipped.

## Branch protection — platform limitation (documented, not ignorable)

This repository is PRIVATE on a GitHub free plan (owner: user `ahmedtaha55555412-code`):
- classic branch protection API: **403** (attempted 2026-09-30 with the required-checks +
  no-force-push + no-deletion body — recorded);
- rulesets API: **403** — "Upgrade to GitHub Pro or make this repository public to enable
  this feature".
Required-status-check enforcement on `main` is therefore NOT configurable at this plan
level. Compensating controls in effect: (1) CI `verify` runs on every push to `main` and
every PR, and each phase record pins the exact SHA it was green on; (2) the only
collaborator is the owner account (no other write access exists); (3) the production
branch is locked to `main` on the Vercel side; (4) force-pushes are not part of the
workflow and would be visible in the run/audit history. If the plan is upgraded, the
first action must be: require the `verify` check for `main`, block force pushes and
deletions, include administrators.

## Preview workflow (proven 2026-09-30)

Pushing any non-`main` branch (or opening a PR) triggers a Vercel Preview deployment via
the existing Git integration — no second pipeline exists or is needed. Evidence
(trigger-matrix branch): Vercel built preview `amira-store-git-<branch>-….vercel.app` and
posted the "Vercel Preview Comments" check. **Preview deployments are protected by Vercel
Deployment Protection (SSO)** — anonymous requests 302 to `vercel.com/sso-api` with
`x-robots-tag: noindex` — so previews are not publicly crawlable; application-level preview
smoke requires an authenticated session. Preview databases are isolated per the Vercel↔Neon
integration's copy-on-write per-deployment branches (docs/ops/DATABASE.md §9.1).

## Rollback & recovery (the questions this runbook must answer)

- **Last known-good deployment**: Vercel dashboard → Project → Deployments; the newest
  READY deployment whose `githubCommitSha` equals a CI-green `origin/main` SHA. The
  production alias history (`amira-store-opal.vercel.app`) shows which deployment serves.
- **Application rollback (no rebuild)**: Vercel dashboard → Deployments → (previous READY
  deployment) → "Promote to Production" / `vercel rollback <deployment-url>` — instant alias
  switch; keep the previous deployment until the incident is closed. Deployments of docs-only
  commits are zero-source-delta by construction (verified per phase).
- **If a migration has already applied**: migrations are FORWARD-ONLY. Never roll the schema
  back; roll the APPLICATION back only to a release that is compatible with the CURRENT
  schema (this is why new migrations must be backward-compatible with the previous release:
  additive columns/tables/indexes only, no renames/drops in the same release that removes
  the old path). The `__drizzle_migrations` journal row for a migration stays; a rolled-back
  app simply ignores the new columns.
- **Which migrations are backward-compatible**: every migration so far (0000 init,
  0001 pg_trgm search indexes, 0002) is additive/schema-complete from its predecessor; the
  rehearsal profile (23 tables / 9 enums / invariant CHECKs) is the compatibility baseline.
- **Neon branch/state recovery**: Neon point-in-time restore / branch reset from the console
  (owner-side, control-plane) re-creates the branch state; production `main` identity is
  pinned by the hash-only fingerprints in docs/ops/DATABASE.md §9.6 (production
  `a77fc2afd8ac2bd7…` @ `ep-cool-art-b1snfj5i-pooler` — re-verify after ANY change).
- **Live rollback rehearsal**: deliberately NOT executed against production (a destructive
  rollback just to prove the mechanism is forbidden). The mechanism above was rehearsed as
  far as safely possible this phase: deployment-history inspection + docs-only
  zero-delta verification + forward-only migration proof on a disposable database. The
  remaining live step (an actual production promote/rollback) requires the owner-side
  session and is recorded as environment-blocked (ISSUE-2026-09-30-068).

## Deployment order (standing — matches the workflow above)

1. GitHub `main` green: CI "verify" = success on the EXACT commit SHA.
2. Phase-gate verification green outside CI (deterministic regression on a disposable
   database; Blob-credential suites when credentials are provisioned).
3. Migration (if the release contains one): rehearsed on a disposable database FIRST,
   then applied to Neon production per the runbook (never `db push`).
4. Vercel deploys `main` to Production automatically (Git integration).
5. Confirm the deployment's source SHA == the CI-green SHA; smoke production (read-only).
6. Monitor runtime logs for 5xx; preserve the previous READY deployment as the rollback
   target until the incident window closes.
