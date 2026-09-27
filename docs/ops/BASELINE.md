# Baseline Technical Report — PHASE_00

Recorded: 2026-09-26 (Africa/Cairo)
Executed by: Z.ai Code (autonomous execution agent)

## 1. Tooling verification (commands + results)

| Tool | Required | Command | Result |
|---|---|---|---|
| Node.js | required | `node --version` | v24.21.0 ✅ |
| Git | required | `git --version` | 2.47.3 ✅ |
| Package manager (chosen) | required | `bun --version` | 1.3.14 ✅ (Bun chosen as the environment's runtime/package manager; scripts in `package.json`) |
| GitHub CLI (`gh`) | required for PHASE_00 provisioning | `gh --version` / `gh auth status` | **NOT INSTALLED** ❌ → BLOCKER B-001 |
| Vercel CLI (`vercel`) | required for PHASE_00 provisioning | `vercel --version` / `vercel whoami` | **NOT INSTALLED** ❌ → BLOCKER B-002 |
| Neon CLI (`neonctl`) | required for PHASE_00 provisioning | `neonctl --version` / `neonctl whoami` | **NOT INSTALLED** ❌ → BLOCKER B-003 |

No authenticated integrations exist for GitHub/Neon/Vercel in this execution environment:
no CLIs installed, no `GH_TOKEN`/`VERCEL_TOKEN`/`NEON_API_KEY` environment variables, no
`~/.config/gh`, no `~/.git-credentials`. Per PHASE-00 task 3 and stop conditions, these are
recorded as BLOCKED and are **not faked**.

## 2. Workspace state

- Application workspace: `/home/z/my-project` (this repository).
- Planning repository (documentation only, read-only reference): `https://github.com/ahmedtaha55555412-code/amira-store-plan.git` @ `2f4e4b31927b9caa28f32c0ac7c26f0a537dfbf8` — cloned to `/home/z/amira-store-plan`; never modified; never used as application source.
- No legacy Amira Store code exists anywhere in the workspace — greenfield confirmed.
- Environment adaptation (documented, ISSUE-2026-09-26-004): the execution environment provides a pre-initialized Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui scaffold instead of a literally empty directory. It contains no Amira Store business code. It is used as the greenfield application base; all scaffold branding was removed in this phase.

## 3. Repository state

- Local git: initialized, branch `main`, identity `Z User <z@container>` (sandbox default at bootstrap time). **2026-09-27 update:** repo-local identity corrected to the owner's GitHub noreply address (`323053819+ahmedtaha55555412-code@users.noreply.github.com`) so Vercel can attribute commits to the owner's Git account — see ISSUE-2026-09-27-011. Commits before `d23f236` retain the sandbox identity (history not rewritten).  
- Baseline commit: created this phase (see `git log`).
- GitHub remote: `https://github.com/ahmedtaha55555412-code/amira-store` (**PRIVATE**, default branch `main`, repo id `1390099417`) — created and pushed 2026-09-26 (B-001 cleared).
- CI scaffolding: `.github/workflows/ci.yml` (install → typecheck → lint → build; triggers: push/PR on `main`).

## 4. Application baseline

- Framework: Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS 4 (current stable in environment; MASTER_PLAN §27 direction).
- Baseline page `src/app/page.tsx`: minimal Phase-00 boot-proof placeholder (Arabic, RTL document direction set at `<html>`). No design-system work performed — that is PHASE_01 scope (fonts, tokens, brand assets, component primitives, homepage shell).
- Database tooling present in scaffold: Prisma/SQLite (sandbox default). **Not used by Amira Store.** Per MASTER_PLAN §25, PHASE_02 introduces Drizzle ORM + PostgreSQL migration workflow targeting Neon. Decision recorded here so no phase later mistakes Prisma for the project's data layer.
- Local dev database: sandbox SQLite file via `DATABASE_URL` (local only; disposable; untracked from Git this phase — ISSUE-2026-09-26-006). Neon provisioning is pending B-003.

## 5. Package scripts (initial)

| Script | Purpose |
|---|---|
| `dev` | Next.js dev server on port 3000 |
| `build` | Production build |
| `start` | Production server (standalone) |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` (added this phase) |
| `db:*` | Scaffold Prisma helpers — superseded by Drizzle workflow in PHASE_02 |

## 6. Environment contract (committed, names only)

`.env.example` defines: `DATABASE_URL`, `AUTH_SESSION_SECRET`, `APP_URL`, `BLOB_READ_WRITE_TOKEN`.
Real values only in `.env` (git-ignored) and platform secret stores (GitHub Actions secrets / Vercel env). Environment separation model (Local/Preview/Production) per `docs/ops/DEPLOYMENT_RUNBOOK.md`.

## 7. Integration checks (PHASE-00)

| Check | Result |
|---|---|
| Dependencies install successfully | ✅ `bun install` clean; also clean on Vercel build (deployment `dpl_E5DUbpcL6633dBh9iXrmA5QkHSm3`) |
| New app starts successfully in development | ✅ dev server on port 3000, `/` renders Arabic baseline page |
| GitHub remote exists and baseline commit is pushed | ✅ private repo `amira-store` pushed (B-001 cleared, 2026-09-26); remote `main` verified == local HEAD at each docs push |
| Vercel project linked + non-production deployment path proven | ✅ project `prj_jaEPtjMP1YvTGaynt9LaHXzxcTFA` linked locally + Git-linked to `ahmedtaha55555412-code/amira-store` (`productionBranch: main`); **preview deployment READY** — `dpl_E5DUbpcL6633dBh9iXrmA5QkHSm3`, branch `phase-00/bootstrap-preview`, commit `e7e1c49`, framework `nextjs`, time-to-ready 36.6 s (B-002 cleared, 2026-09-27) |
| Neon project/branch access proven without exposing credentials | ✅ Neon-Managed Postgres resource `neon-cobalt-globe` (`store_Xot2tvwkL5JACcF7`) → Neon project `tiny-mud-82763154` (fra1, `ready`) bound to all three environments with 18 `DATABASE_*` vars (B-003 cleared via Vercel Marketplace integration path, 2026-09-27); secret values not decryptable with user token — proven via API metadata only |
| No real secrets committed | ✅ after fix — scaffold-era tracked `.env` and `db/custom.db` discovered during pre-commit review and untracked (ISSUE-2026-09-26-006); `.env*` ignored with `!.env.example` exception; `db/*.db` ignored; staged-diff secret scan clean |

## 8. Provisioning pending owner authorization

The following resources cannot be created until the owner authorizes each account in this workspace. Required authorization steps (one-time each):

1. **GitHub (B-001):** install `gh` and authenticate (`gh auth login` — browser/OAuth) or provide an equivalent authenticated GitHub connection (e.g., `GH_TOKEN` in the environment secret store). Then: create private repo `amira-store`, add remote, push baseline.
2. **Vercel (B-002):** install `vercel` and authenticate (`vercel login` — browser/OAuth). Then: create/link project, configure Local/Preview/Production env separation.
3. **Neon (B-003):** install `neonctl` and authenticate (`neonctl auth` — browser/OAuth). Then: create Amira Store Postgres project + dev/preview/prod branch strategy.

No unrelated GitHub/Neon/Vercel resources were touched. No secrets were stored in Git or printed.

## 9. Addendum (2026-09-27) — infrastructure registry + provisioning closure

All PHASE_00 blockers cleared. Resource identity registry (no secrets):

| Resource | ID | Notes |
|---|---|---|
| GitHub repo | `ahmedtaha55555412-code/amira-store` (repo id `1390099417`, PRIVATE) | default branch `main`; GitHub App access granted by owner 2026-09-27 |
| Vercel team/account | `team_5ThEi7AtAs9s7KUjKD9sR9zy` (user `ahmedtaha55555412-7683`, Hobby) | OAuth device-flow auth, credential in git-ignored vault |
| Vercel project | `prj_jaEPtjMP1YvTGaynt9LaHXzxcTFA` (`amira-store`, framework `nextjs`, region iad1) | git link `{type: github, org: ahmedtaha55555412-code, repo: amira-store, productionBranch: main}` |
| Neon installation | `icfg_XaLDAPAdjX8ajtYn8mL9vC0a` (slug `neon`, marketplace, plan `free_v3`) | linked to owner's existing Neon org (`org-frosty-darkness-82889078`, install-time record) |
| Neon resource | `neon-cobalt-globe` (`store_Xot2tvwkL5JACcF7`) | Neon project `tiny-mud-82763154`, region fra1, status `ready`, Neon Auth on |
| Neon env binding | 18 `DATABASE_*` vars | targets `development`+`preview`+`production`; prefix `DATABASE`; 1:1 with store secrets |
| Other env vars | `AUTH_SESSION_SECRET` ×3 targets (distinct values, sensitive); `APP_URL` ×development | provisioned 2026-09-26 |
| Preview deployment proof | `dpl_E5DUbpcL6633dBh9iXrmA5QkHSm3` → READY | branch `phase-00/bootstrap-preview`, commit `e7e1c49` (owner-attributed), `nextjs`, 36.6 s; URL SSO-protected (302) as expected on Hobby |

Known non-blocking findings: ISSUE-2026-09-27-010 (orphan Neon resource `amira-store` / `nameless-bar-74352862`, 0 connections — owner decides keep/delete); ISSUE-2026-09-27-011 (Vercel blocked first Git deployment over commit-author mapping — FIXED via repo-local git identity). Legacy Vercel Marketplace resource named `amira-store` is NOT bound to anything; the bound resource is `neon-cobalt-globe`.

## 10. Addendum (2026-09-27) — environment-binding topology (pre-PHASE_03 safety round)

| Binding | Target | Status |
|---|---|---|
| Production | Neon `neondb` on the primary (main) branch of `tiny-mud-82763154` (`neon-cobalt-globe`, fra1) | UNCHANGED — never migrated/seeded/written by agents; hash fingerprint recorded (sha256 `a77fc2afd8ac2bd7…`) |
| Preview | isolated copy-on-write Neon branch per Preview Deployment (integration-native) | ISOLATED ✅ |
| Development | **same value as production** (integration default; no dedicated branch) | GAP — ISSUE-2026-09-27-019 OPEN; standing guardrail: treated as production-equivalent (no migrate/seed/writes); remediation path documented in `docs/ops/DATABASE.md` §9 (owner console steps + compensating control + hash-only verification) |

The 18 `DATABASE_*` variables are integration-store secrets (ciphertext to user tokens; single entries targeting all three environments); rebinding one environment is not exposed by the Vercel↔Neon public API and branch creation requires the Neon control plane — recorded as the exact limitation in `docs/ops/DATABASE.md` §9.2.
