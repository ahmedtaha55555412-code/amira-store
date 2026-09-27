# Issue Log

## Required format
### ISSUE-YYYY-MM-DD-NNN
- Phase:
- Severity:
- Status: OPEN / FIXED / BLOCKED / ACCEPTED
- Symptom:
- Reproduction:
- Root cause:
- Minimal fix:
- Verification:
- Related files:
- Notes:

---

### ISSUE-2026-09-26-001
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks GitHub provisioning steps only)
- Status: BLOCKED
- Symptom: GitHub CLI (`gh`) is not installed and no authenticated GitHub connection (token/OAuth) exists in the execution environment; the new Amira Store GitHub repository cannot be created and the baseline commit cannot be pushed.
- Reproduction: `gh --version` → command not found; `gh auth status` → command not found; no `GH_TOKEN`, no `~/.config/gh`, no `~/.git-credentials`; `git remote -v` in `/home/z/my-project` → empty.
- Root cause: The execution environment has no GitHub authorization configured; account authorization is an owner-controlled step that the agent cannot and must not fake.
- Minimal fix: Owner authorizes GitHub in this workspace (install/authenticate `gh` via browser/OAuth, or provide an equivalent authenticated connection through the environment secret store). Agent then creates private repo `amira-store`, adds `origin`, pushes baseline.
- Verification: `gh auth status` succeeds; `git ls-remote origin` returns the new repository; baseline commit visible on remote `main`.
- Related files: `docs/ops/BASELINE.md` (§1, §8), `.git/config` (remote pending)
- Notes: No unrelated repositories touched.

### ISSUE-2026-09-26-002
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks Vercel provisioning steps only)
- Status: BLOCKED
- Symptom: Vercel CLI is not installed and no authenticated Vercel connection exists; the Vercel project cannot be created/linked and the non-production deployment path cannot be proven in PHASE_00.
- Reproduction: `vercel --version` → command not found; `vercel whoami` → command not found; no `VERCEL_TOKEN`; no `.vercel` project link.
- Root cause: No Vercel authorization configured in the execution environment.
- Minimal fix: Owner authorizes Vercel (`vercel login` browser/OAuth or equivalent authenticated integration). Agent then creates/links the Amira Store project and configures Local/Preview/Production environment separation.
- Verification: `vercel whoami` returns the owner account; `vercel project ls` / link metadata shows the Amira Store project.
- Related files: `docs/ops/BASELINE.md` (§1, §8)
- Notes: Environment separation is contractually established via `.env.example` + `docs/ops/DEPLOYMENT_RUNBOOK.md` pending provisioning.

### ISSUE-2026-09-26-003
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks Neon provisioning steps only)
- Status: BLOCKED
- Symptom: Neon CLI (`neonctl`) is not installed and no authenticated Neon connection exists; the Neon project/database and dev/preview/production branch strategy cannot be established in PHASE_00.
- Reproduction: `neonctl --version` → command not found; `neonctl whoami` → command not found; no `NEON_API_KEY`.
- Root cause: No Neon authorization configured in the execution environment.
- Minimal fix: Owner authorizes Neon (`neonctl auth` browser/OAuth or equivalent). Agent then creates the Amira Store Postgres project and required branches; credentials stored only in platform secret stores.
- Verification: `neonctl whoami` succeeds; `neonctl projects list` shows the Amira Store project; branch list shows dev/preview/prod strategy.
- Related files: `docs/ops/BASELINE.md` (§1, §4, §8)
- Notes: Local disposable dev DB (sandbox SQLite) is used only for Phase-00 boot verification; PHASE_02 introduces Drizzle/PostgreSQL migration workflow.

### ISSUE-2026-09-26-004
- Phase: PHASE_00
- Severity: LOW
- Status: ACCEPTED
- Symptom: The execution environment provides a pre-initialized Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui scaffold (including unused Prisma/SQLite helpers) rather than a literally empty workspace.
- Reproduction: Inspect `/home/z/my-project` before this phase.
- Root cause: Environment characteristic of the ZCode sandbox, not a legacy Amira Store artifact.
- Minimal fix: Treated as the greenfield application base; scaffold branding removed; no business code existed; deviation documented in `docs/ops/BASELINE.md` §2; Prisma explicitly marked as NOT the Amira Store data layer (Drizzle/PostgreSQL per MASTER_PLAN §25 arrives in PHASE_02).
- Verification: No Amira Store business logic exists in scaffold; baseline page boots; lint/typecheck pass.
- Related files: `package.json`, `src/app/page.tsx`, `src/app/layout.tsx`, `docs/ops/BASELINE.md`
- Notes: Accepted environment adaptation; does not weaken any plan requirement.

### ISSUE-2026-09-26-006
- Phase: PHASE_00
- Severity: HIGH
- Status: FIXED
- Symptom: `.env` (and the sandbox local dev database `db/custom.db`) were tracked by Git — committed by the pre-existing scaffold's initial commits before ignore rules took effect. This violates the plan's production-safety rule "Never place real secrets in Git" (AGENTS.md) even though the current `.env` holds only a low-sensitivity local SQLite URL.
- Reproduction: `git ls-files .env db` → both listed.
- Root cause: Scaffold repository predates the `.env*` ignore entry; `.gitignore` does not untrack files that were already committed.
- Minimal fix: `git rm --cached .env db/custom.db` (untrack, keep local files) + append `db/*.db` to `.gitignore` + add `!.env.example` exception so the environment contract stays tracked.
- Verification: `git ls-files .env db` → empty; `git ls-files --cached .env.example` → tracked; staged diff secret scan clean; dev server still boots after untracking.
- Related files: `.gitignore`, `.env.example`, `db/custom.db`
- Notes: Git history retains scaffold-era blobs from before this project existed; no history rewrite performed (not warranted — the removed `.env` contains no production secret; content reviewed before decision).

### ISSUE-2026-09-26-005
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: `bun run typecheck` (tsc --noEmit) exited 1 with 4 errors — 2× TS2307 missing `socket.io`/`socket.io-client` in `examples/websocket/`, 2× type errors in `skills/` scripts. Zero errors in `src/` (Amira Store application code).
- Reproduction: `bun run typecheck` on the untouched baseline.
- Root cause: `tsconfig.json` `include` globs (`**/*.ts`, `**/*.tsx`) sweep in execution-environment demo/skill assets that are not part of the Amira Store application; `socket.io` packages are intentionally not installed for the app.
- Minimal fix: Added `examples` and `skills` (plus future `tests` guard) to `tsconfig.json` `exclude`. No deletions, no dependency changes, no code edits in those folders.
- Verification: `bun run typecheck` → exit 0; `bun run lint` → exit 0; dev server still boots.
- Related files: `tsconfig.json`
- Notes: These folders are sandbox tooling, not application scope; excluding them from the app's TS program does not hide any application error.

### ISSUE-2026-09-26-007
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: 112 tracked files appeared permanently modified in `git status` (mode change 100644=>100755) despite zero content change, polluting every diff/stage operation before the GitHub push.
- Reproduction: `git status --short` after the baseline commit; `git diff --summary` → only `mode change 100644 => 100755` lines; `git diff --numstat` → content churn only in `.zscripts/dev.pid` (see ISSUE-2026-09-26-008).
- Root cause: The sandbox filesystem marks all workspace files as executable; Git's fileMode tracking compares the stored 644 modes against the filesystem's 755.
- Minimal fix: `git config core.fileMode false` (repository-local config only). No file content touched; no global setting forced on other environments.
- Verification: `git status --short` → clean except the genuine `.zscripts/dev.pid` entry; `git diff --numstat` → no content churn.
- Related files: `.git/config`
- Notes: Content-neutral; hides no real change — verified via numstat before applying.

### ISSUE-2026-09-26-008
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: `.zscripts/dev.pid` (sandbox dev-server runtime PID file) was tracked by Git and churns on every dev-server restart, producing meaningless diffs/commits.
- Reproduction: `git diff --numstat` shows a 1/1 change in `.zscripts/dev.pid` after each sandbox dev-server restart.
- Root cause: The scaffold tracked a runtime artifact; PID values are environment-local state, not project source.
- Minimal fix: `git rm --cached .zscripts/dev.pid` + append `.zscripts/dev.pid` to `.gitignore` (the runnable `.zscripts/*.sh` tooling remains tracked).
- Verification: `git ls-files .zscripts/dev.pid` → empty; `git status --short` → clean; local file kept on disk so sandbox tooling keeps working.
- Related files: `.gitignore`, `.zscripts/dev.pid`
- Notes: Same hygiene class as ISSUE-2026-09-26-006.

### ISSUE-2026-09-26-009
- Phase: PHASE_00
- Severity: HIGH
- Status: FIXED
- Symptom: Between execution sessions the sandbox was recycled: all home-directory state outside `/home/z/my-project` was wiped (`~/.config/gh/hosts.yml` GitHub credential, `~/.local/bin/gh`, globally installed `vercel`/`neon` CLIs, `~/.npm-global` packages). Previously verified `gh` authentication disappeared; CLI installs had to be repeated.
- Reproduction: After the session gap, `gh: command not found`; `ls ~/.config/gh/` → not found; `~/.npm-global/bin` no longer contains `vercel`/`neon`. `/home/z/my-project` (workspace, git history) fully intact.
- Root cause: The execution environment persists only the project workspace across recycles; dotfiles, installed binaries, and credential stores outside it are ephemeral.
- Minimal fix: (1) Reinstall `gh` (static binary), `vercel`, `neonctl`. (2) Create git-ignored credential vault `/home/z/my-project/.auth/` (chmod 700, files chmod 600) inside the persistent workspace; CLI credential files are stored/restored from there (`gh` hosts, Vercel `auth.json`, Neon credentials) after each recycle. Never committed, never pushed, never displayed (`.gitignore` entry `.auth/` verified with `git check-ignore`).
- Verification: `git check-ignore .auth/` → ignored; `git status --short` → clean; restored `gh auth status` succeeds after recycle; repo remote push unaffected.
- Related files: `.gitignore`, `.auth/` (untracked)
- Notes: This is an environment constraint, not a plan deviation. Tokens stored here are the same files the CLIs would keep in `$HOME` on a normal machine; sensitivity handling unchanged (never logged/displayed/committed).

### ISSUE-2026-09-27-010
- Phase: PHASE_00
- Severity: LOW
- Status: OPEN (owner decision required — no action taken per owner instruction)
- Symptom: Two Neon marketplace resources exist on the Vercel team after the integration install: (1) `neon-cobalt-globe` (`store_Xot2tvwkL5JACcF7`, Neon project `tiny-mud-82763154`) — CORRECTLY bound to project `amira-store` across development/preview/production; (2) `amira-store` (`store_dqlFkjRT5Qe6XRyB`, Neon project `nameless-bar-74352862`) — connected to ZERO projects, injects no environment variables. The second resource appears to be a leftover from the integration connect flow (created ~9 minutes after the first).
- Reproduction: `GET /v1/storage/stores?teamId=team_5ThEi7AtAs9s7KUjKD9sR9zy` → 2 stores; store `store_dqlFkjRT5Qe6XRyB` → `totalConnectedProjects: 0`, `projectsMetadata: []`.
- Root cause: Duplicate resource creation during the owner's browser-side integration flow (exact UI path unknown; both resources belong to the same Neon installation `icfg_XaLDAPAdjX8ajtYn8mL9vC0a`).
- Minimal fix: Owner decision — either delete the orphan via Vercel Dashboard → Storage → resource `amira-store` → Delete (frees one Neon Free-plan project slot; does not affect the bound resource), or keep it. NO deletion/rename performed by the agent (explicit owner constraint during verification round).
- Verification: Post-decision — `GET /v1/storage/stores` should list exactly one store; `totalConnectedProjects` on the surviving store remains 1.
- Related files: `EXECUTION_STATUS.md` (PHASE_00 addendum 2026-09-27), `worklog.md` (Task 4-f)
- Notes: No functional conflict — the bound resource is unambiguous (all 18 `DATABASE_*` env vars on `amira-store` carry `contentHint.storeId = store_Xot2tvwkL5JACcF7`). Orphan consumes a Neon Free-tier project slot (limit 100) only.

### ISSUE-2026-09-27-011
- Phase: PHASE_00
- Severity: MEDIUM (blocked the non-production deployment proof)
- Status: FIXED
- Symptom: First Git-triggered Vercel deployment (`dpl_3fJuSPdnrPUR5Tneeor7CpvDK8rC`, commit `a1f993d` on `phase-00/bootstrap-preview`) landed in state `BLOCKED` with `buildSkipped: true`, `alwaysRefuseToBuild: true`; `readyStateReason: "The deployment was blocked because Vercel couldn't find a Git account for the commit author."` (Hobby plan refuses builds from unmapped authors.)
- Reproduction: push any commit whose author email does not match the GitHub account connected to the Vercel project; observe deployment BLOCKED via `GET /v13/deployments/{uid}`.
- Root cause: repo git identity was the sandbox default `Z User <z@container>`; Vercel maps commit authors to Vercel accounts via GitHub account emails, and `z@container` matches nothing.
- Minimal fix: repo-local `git config user.name "ahmedtaha55555412-code"` + `user.email "323053819+ahmedtaha55555412-code@users.noreply.github.com"` (owner's GitHub noreply); branch commit amended (`e7e1c49`) and re-pushed. No history rewrite of pushed `main` commits.
- Verification: new deployment `dpl_E5DUbpcL6633dBh9iXrmA5QkHSm3` → `READY` (framework `nextjs`, 36.6 s, author `ahmedtaha55555412-code`); blocked deployment left in place as a record (non-functional).
- Related files: `.git/config` (repo-local), `docs/ops/BASELINE.md` §3/§7/§9
- Notes: All future commits in this workspace must be authored with the owner-attributed identity; repo-local config persists but the shell resets between sessions — the config lives in `.git/config`, which persists with the workspace.

### ISSUE-2026-09-27-012
- Phase: PHASE_00 (closure hygiene)
- Severity: MEDIUM (first CI run on main red)
- Status: FIXED
- Symptom: First GitHub Actions run (36298109713, push `f397c02`) failed at Typecheck: `src/lib/db.ts(1,10): error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'`. Sandbox typecheck passed because its Prisma client was generated earlier.
- Reproduction: fresh runner + `bun install --frozen-lockfile` → `bun run typecheck` → TS2305.
- Root cause: Bun blocks `@prisma/client`'s postinstall hook on CI (trustedDependencies policy), so `prisma generate` never ran before `tsc --noEmit`.
- Minimal fix: explicit CI step `bun run db:generate` between install and typecheck (comment in workflow explains scope: scaffold helper only; PHASE_02 introduces Drizzle and revisits).
- Verification: follow-up CI run on main green (run id recorded in worklog Task 4-h).
- Related files: `.github/workflows/ci.yml`, `src/lib/db.ts` (untouched scaffold file)
- Notes: Production deployment unaffected (`dpl_AQD3anGMnopwHDcxn4bnDJWdzrNJ` READY — Next build on Vercel does not typecheck `src/lib/db.ts` in the same way).

### ISSUE-2026-09-27-013
- Phase: PHASE_01
- Severity: MEDIUM (visual/RTL defect in foundational primitives)
- Status: FIXED
- Symptom: In the RTL storefront, the close (✕) button of the mobile navigation Sheet overlapped the sheet title "القائمة" (both anchored to the physical right edge). The shared shadcn `Dialog`/`Sheet` close buttons used physical positioning (`absolute top-4 right-4`), which is wrong under `dir="rtl"` where inline-start = right. Browser QA (agent-browser, 375px viewport) surfaced it.
- Reproduction: open `/` at 375px → tap "فتح قائمة التنقل" → sheet title glyphs collide with the ✕.
- Root cause: stock shadcn primitives assume LTR; physical `right-4` does not mirror in RTL documents.
- Minimal fix: `top-4 right-4` → `top-4 end-4` (CSS logical property) in `src/components/ui/sheet.tsx` and `src/components/ui/dialog.tsx` — correct in both LTR (admin, later) and RTL.
- Verification: re-opened the mobile sheet at 375px after fix — title clean at inline-start, ✕ at inline-end; sheet nav click closes sheet and scrolls to `#offers` (scrollY 2616, section in view); playground dialog unaffected.
- Related files: `src/components/ui/sheet.tsx`, `src/components/ui/dialog.tsx`
- Notes: Any future shadcn primitive copied into the repo must be re-audited for physical positioning (`left/right`) versus logical (`start/end`) under RTL.

### ISSUE-2026-09-27-014
- Phase: PHASE_01
- Severity: LOW (dev-only cosmetic; QA tooling collision)
- Status: FIXED
- Symptom: Next.js dev-tools indicator (fixed, bottom-left default) overlapped the QA playground trigger at 1440px; after moving it to `top-right`, it overlapped the RTL header hamburger at 375px (both are fixed corner overlays in the same corners as the store's own overlays).
- Reproduction: `bun run dev` → open `/` at 375/1440px → observe overlay collisions with `<nextjs-portal>`.
- Root cause: the store intentionally occupies fixed corners (WhatsApp FAB bottom-start, QA playground bottom-end, dense header top); every dev-indicator corner collides on at least one breakpoint.
- Minimal fix: `devIndicators: false` in `next.config.ts` (development-only flag; production bundle unaffected).
- Verification: dev server restarted; no `<nextjs-portal>` element present; FAB/playground/header interactions clear at 375/768/1440px.
- Related files: `next.config.ts`
- Notes: recorded for transparency; not a product defect.

### ISSUE-2026-09-27-015
- Phase: PHASE_02
- Severity: BLOCKER (migration failed on a clean database — caught by the fresh-DB rehearsal)
- Status: FIXED
- Symptom: `drizzle-kit migrate` on a fresh empty database failed: `ERROR: there is no unique constraint matching given keys for referenced table "attribute_values"` while adding `variant_attribute_values_value_attribute_pair_fk` (composite FK → `attribute_values(id, attribute_id)`). The migration had never been applied to any real database, so nothing was corrupted; the defect existed only in the generated SQL ordering.
- Reproduction: `bun run db:verify:local` (fresh disposable PostgreSQL, migrations only).
- Root cause: drizzle-kit emits all FK `ALTER TABLE` statements immediately after table creation but all `CREATE UNIQUE INDEX` statements later, in the index section. The composite FK requires `attribute_values_id_attribute_key` to exist BEFORE the FK is added; drizzle-kit's statement ordering could not express that dependency.
- Minimal fix: reviewed and edited the generated migration `drizzle/0000_init_schema.sql` — moved the single `CREATE UNIQUE INDEX "attribute_values_id_attribute_key" …` statement to directly after the `CREATE TABLE "attribute_values"` statement. End-state schema is byte-identical; only statement order changed (drizzle-kit documents reviewing/adjusting generated SQL before applying).
- Verification: full re-run of `bun run db:verify:local` → migrations apply cleanly to TWO fresh databases; 28/28 probes pass.
- Related files: `drizzle/0000_init_schema.sql`
- Notes: This is exactly the failure class the clean-database rehearsal (PHASE-02 task 13) exists to catch. Any future migration introducing a composite FK must re-check index ordering in the generated SQL.

### ISSUE-2026-09-27-016
- Phase: PHASE_02
- Severity: HIGH (FK miswired — invariant hole; caught by the seed run)
- Status: FIXED
- Symptom: Development seed failed on the first variant-attribute insert: `violates foreign key constraint "variant_attribute_values_attribute_id_attribute_values_id_fk" — Key (attribute_id)=… is not present in table "attribute_values"`.
- Reproduction: `bun run db:seed` on a migrated disposable database.
- Root cause: in `src/db/schema/catalog.ts` the denormalized `variant_attribute_values.attributeId` was (copy-paste) wired to reference `attributeValues.id` instead of `attributes.id`. The single-column FK therefore demanded an attribute-VALUES id in a column that legitimately stores an attributes id; the composite FK (which is the real consistency guard) would also have been unsatisfiable together with it.
- Minimal fix: `attributeId` references `attributes.id` (ON DELETE cascade). The composite FK `(attribute_value_id, attribute_id) → attribute_values(id, attribute_id)` remains the invariant enforcer: it is now logically satisfiable AND still rejects mismatched value/attribute pairs (verified by a dedicated probe).
- Verification: seed completes (7 products / 18 variants / 24 assignments); probe "value/attribute pair consistency (composite FK)" rejects a color-value id paired with the size attribute id; 28/28 probes pass.
- Related files: `src/db/schema/catalog.ts`, `drizzle/0000_init_schema.sql` (regenerated)
- Notes: Found because the seed exercises real data paths before any UI exists — data-layer-first catching design errors as intended.

### ISSUE-2026-09-27-017
- Phase: PHASE_02
- Severity: MEDIUM (seed idempotency gap — schema constraint missing)
- Status: FIXED
- Symptom: Re-running the development seed duplicated one product-gallery image row (images 13 → 14). SEED_PLAN requires re-runs to never duplicate.
- Reproduction: run `bun scripts/db-seed.ts` twice against the same disposable database; compare `SELECT count(*) FROM product_images`.
- Root cause: non-primary gallery rows had NO unique constraint covering them (primary-image partial unique indexes only), so `ON CONFLICT DO NOTHING` had nothing to conflict on for those rows.
- Minimal fix: added two partial unique indexes — `(product_id, media_asset_id) WHERE variant_id IS NULL` and `(variant_id, media_asset_id) WHERE variant_id IS NOT NULL` — "same media cannot be attached twice at the same level" (a genuine domain rule), making seeds and future admin edits naturally idempotent. Migration regenerated accordingly.
- Verification: seed re-run → counts stable at 7/18/24/13; 28/28 probes pass.
- Related files: `src/db/schema/catalog.ts`, `drizzle/0000_init_schema.sql`, `docs/DATA_DICTIONARY.md` (note 9)
- Notes: none.

### ISSUE-2026-09-27-018
- Phase: PHASE_02 (environment)
- Severity: MEDIUM (blocks remote verification + push this session; not a code defect)
- Status: RESOLVED (both halves closed — Vercel/Neon half 2026-09-27; GitHub half 2026-09-27, see closing addendum)
- Symptom: The git-ignored credential vault `.auth/` is missing after the latest sandbox recycle, so `gh`/`vercel` authentication and `git push` (GitHub) are unavailable this session. Recurrence of the ISSUE-2026-09-26-009 environment class.
- Reproduction: `git push` → credential helper `/home/z/my-project/.auth/bin/gh-cred` not found; no `gh`/`vercel` binaries on PATH.
- Root cause: sandbox recycles wipe everything outside `/home/z/my-project`; the vault restore step did not run before this session.
- Minimal fix: owner restores CLI credentials (GitHub + Vercel) per ISSUE-2026-09-26-009 mitigation; then `git push origin main`. Live-Neon verification steps are pre-written in `docs/ops/DATABASE.md` §8 and need no further code work.
- Verification: after restore — `gh auth status` succeeds, push succeeds, CI run green on the PHASE_02 commit.
- Related files: none (environment)
- Notes: PHASE_02 remote-scope items are therefore satisfied by the committed local rehearsal on real PostgreSQL 18 (identical wire protocol/driver) with the live-Neon application documented as the single remaining remote step; production is untouched either way.

**Addendum (2026-09-27, PHASE-02 compliance round):**
- Vercel/Neon half RESOLVED: Vercel authentication restored via the OAuth device flow (owner approved in browser; the flow was driven manually because the sandbox kills background pollers between turns; device code displayed, token/refresh token never displayed and shredded after use). No Neon API key was needed — the existing Vercel↔Neon integration supplied per-environment connection secrets via `vercel env pull` (values compared by hash only, never printed).
- Live-Neon verification EXECUTED and PASSED: exact committed migration applied via `drizzle-kit migrate` to a real EMPTY disposable Neon database (`phase02_drizzle_verify_tmp`, PostgreSQL 18.6/fra1) → SCHEMA_MATCH 23/23 tables + 9/9 enums vs the committed snapshot → `drizzle.__drizzle_migrations` row hash == sha256(drizzle/0000_init_schema.sql) → app-driver smoke (pooled endpoint) write+ROLLBACK clean → disposable db dropped with zero residue → production `neondb` unmodified (public tables [] before/after). Full procedure and evidence: docs/ops/DATABASE.md §8.
- STILL OPEN (GitHub half): `gh` credential restore + `git push origin main` (commits b4fca6e, 49ce1f0, and the PHASE-02 completion commit) + first green CI run on the Drizzle CI workflow. Owner-side action unchanged.

**Closing addendum (2026-09-27, GitHub half RESOLVED — owner-approved device flow):**
- GitHub authentication restored owner-paced: one OAuth device code (GitHub CLI client, scope `repo, workflow, read:org`), owner approved in browser, single token exchange, token never displayed/committed (held in a chmod-600 temp file, shredded after registration; credential now lives only in gh's own config outside the repo). `gh auth status` → Logged in to github.com account `ahmedtaha55555412-code` (active).
- Pushed exactly the pending local history with a plain fast-forward `git push origin main`: `ffcbd43..c6fdea5` — commits `b4fca6e` (PHASE-02 implementation), `49ce1f0` (documented sandbox auto-commit), `d82ed08` (PHASE-02 live-Neon completion docs), `c6fdea5` (pre-PHASE-03 safety-round docs). No force push, no history rewrite, no reset/rebase.
- Source-of-truth equality verified by hash: local `main` HEAD == `origin/main` HEAD == `c6fdea52768554385c25a8958c0b8e7c67216943`; local tree == remote tree (`3a7435818dadbd874fcfd75ad676ff64db814316`) → byte-identical content, no unexpected files; working tree clean; 0 pending commits; `.github/workflows/ci.yml` present at remote HEAD (`3ee34d4c`).
- Secret scan of the pushed range `ffcbd43..main`: 3 grep hits, all `127.0.0.1` loopback placeholders inside the committed local-rehearsal script; zero tokens (`gho_`/`ghp_`/PAT: none).
- Planning repository verified untouched via GitHub API: `ahmedtaha55555412-code/amira-store-plan` HEAD still `2f4e4b31927b9caa28f32c0ac7c26f0a537dfbf8`, `pushed_at=2026-09-26T18:06:04Z` (predates this execution), single branch `main`; no push/edit/recreate/permission change performed.
- Housekeeping: stale repo-local credential helper (pointed at the recycled vault path) removed from `.git/config`; push used gh's credential helper.

### ISSUE-2026-09-27-019
- Phase: PHASE_02 (verification-round discovery) → elevated to pre-PHASE_03 safety gate (owner directive 2026-09-27)
- Severity: MEDIUM (development writes would hit the production database; controlled by standing guardrails)
- Status: OPEN — narrowed scope (2026-09-27): the isolated Neon `development` branch is the ACTIVE local development target via git-ignored `.env.local` (compensating control verified & live); only the Vercel `development`-environment binding gap remains (future `vercel-dev` option recorded in DATABASE.md §9.5)
- Symptom: On the Vercel↔Neon integration, the project's `development` and `production` environments resolve to the IDENTICAL Neon database (`neondb` on the primary branch) — sha256(DATABASE_URL) hashes are equal. There is no dedicated isolated development branch.
- Reproduction: `vercel env pull --environment=development|production` → both DATABASE_URL values hash to a77fc2afd8ac2bd7…; public tables of neondb = [] (only the platform `neon_auth` schema exists).
- Root cause: Neon Vercel-native integration default — one primary-branch database serves production + development; isolated copy-on-write branches are created only per Preview Deployment.
- Impact: a migration run against the "development" env var would hit the production database; agents must never treat the development environment target as disposable. Disposable verification targets must be temporary databases (or owner-created branches) on the same Neon project, exactly as done for PHASE-02 (docs/ops/DATABASE.md §8).
- Minimal fix: none required now. PHASE_14 may create a dedicated dev branch (owner decision; requires Neon console or API access).
- Verification: the PHASE-02 live-Neon round used `phase02_drizzle_verify_tmp` (created empty → migrated → verified → dropped, zero residue); production `neondb` unmodified (public tables [] before/after).
- Related files: docs/ops/DATABASE.md §8
- Notes: the Neon Free plan supports console-created branches if the owner prefers a true dev branch later.

**Addendum (2026-09-27, pre-PHASE_03 safety/continuity round — owner directive):**
- Owner set development-environment isolation as a PHASE_03 gate and prescribed the target architecture: production → main branch, development → dedicated development branch, preview → isolated per-deployment branches, all inside `neon-cobalt-globe` (no second project, no rename/delete, no secrets printed, production untouched).
- Integration limitation CONFIRMED, not worked around: the 18 `DATABASE_*` vars are integration-store secrets (ciphertext to user tokens, proven PHASE_00) jointly targeting all three environments; the Vercel↔Neon native integration exposes no public API for branch creation or per-environment branch rebinding; Neon branch creation requires the console or a Neon API key (neither available owner-paced in-sandbox). A same-branch `CREATE DATABASE` is explicitly NOT accepted as a substitute (no compute/storage isolation from main).
- RESOLUTION RECORDED: exact limitation + concrete safe remediation path written to **docs/ops/DATABASE.md §9** — owner steps: (1) create `development` branch from `main` in the Neon console; (2) map development → `development` in Vercel Storage settings if the integration UI offers it; (3) otherwise owner chooses compensating control (recommended: `.env.local` → development branch for local work; Vercel development env treated as production-equivalent) or explicit manual per-env management (documented tradeoffs); (4) hash-only post-change verification procedure (fingerprints differ, endpoint hosts differ, production hash unchanged, neondb tables unchanged).
- Standing guardrails effective immediately: the Vercel `development` environment is treated as production-equivalent (no migrate/seed/writes through it); disposable targets remain temporary databases on `tiny-mud-82763154`; `drizzle-kit push` remains forbidden; no secret values printed.
- Production state this round: UNCHANGED — zero writes, zero binding changes; evidence from the PHASE-02 live-Neon round stands (public tables [] before/after).

**Addendum (2026-09-27, owner-side isolation gate — final pre-PHASE_03 round):**
- The agent re-checked every control-plane path WITHOUT any database writes or API mutations: Vercel CLI is logged out (no token/auth file), no Neon CLI / API key / config exists anywhere in the sandbox, and the only live credential is GitHub (not a Neon control plane). Branch creation is control-plane-only, so per the standing directive (no invented workarounds, no replacement resources, no same-branch CREATE DATABASE substitute) **no branch was created by the agent and nothing was touched**.
- The exact owner-side walkthrough is now in docs/ops/DATABASE.md §9.3: Neon console (project tiny-mud-82763154 → Branches → Create branch → name `development`, parent `main`, keep copy-data default, endpoint enabled) + Vercel Storage mapping check WITH the critical guardrail (a single project-wide branch selector must NEVER be used — it would rebind Production; only a per-environment mapping is acceptable), plus fallbacks (a)/(b) and the hash-only verification procedure (post-change: sha256(DATABASE_URL.production) must equal the recorded a77fc2afd8ac2bd7…; development hash must differ; endpoint ids must differ).
- Status remains OPEN — REMEDIATION DOCUMENTED. Development remains write-prohibited (production-equivalent) until the owner completes the console step and the fingerprint verification passes.

**Addendum (2026-09-27, binding-capability research round — owner directive after branch creation):**
- **Branch creation CONFIRMED (owner-attested):** the owner created the isolated `development` branch in the Neon console — child of `main`, project `tiny-mud-82763154` / resource `neon-cobalt-globe`. Branches now: `main` (default/production), `development` (new child), `preview/phase-00/bootstrap-preview` (existing Vercel preview branch). Independent verification from the sandbox is not possible (no Neon control-plane credential; DB connections forbidden by standing rules) — recorded as owner-attested evidence.
- **Owner UI finding:** Vercel Marketplace resource settings expose only Allowed Environments (All / Production-only) and an Update Configuration with NO per-environment branch selector.
- **First-party research verdict (docs-only round, ZERO mutations):** the Neon-Managed integration's ONLY documented per-environment Development binding is the installation-time option "Create a branch for your development environment" → a persistent integration-managed `vercel-dev` branch + Vercel development environment variables set by the integration itself (neon.com/docs/guides/neon-managed-vercel-integration). It (1) cannot bind an arbitrary EXISTING branch such as `development`, and (2) has no documented post-install toggle (Managing = variable selection/role, preview branch cleanup, Disconnect only) — enabling it would require the reconnect/reinstall the owner explicitly forbade this round. Vercel-side manual override of the integration-managed `DATABASE_*` variables is impossible (integration-store secrets; also owner-forbidden).
- **Consequence:** Vercel `development` is NOT yet bound to the isolated `development` branch; integration LEFT UNTOUCHED per the owner's conditional; compensating control (§9.3(a): local git-ignored `.env.local` → `development` branch pooled string; Vercel development env write-prohibited) remains the operative development architecture. Full analysis + recorded future `vercel-dev` owner option: docs/ops/DATABASE.md §9.5.
- Status stays OPEN — narrowed scope: "Vercel `development` environment still maps to the production branch; the isolated Neon `development` branch exists but is reachable only via local `.env.local` (future owner options recorded in DATABASE.md §9.5)."

### ISSUE-2026-09-27-020
- Phase: PHASE_03 (start round, 2026-09-27 — owner explicitly authorized the phase)
- Severity: BLOCKER (per ERROR_PROTOCOL: prevents phase completion; security/data boundary involved)
- Status: OPEN — BLOCKED at the database-safety gate; PHASE-03 NOT started; zero code written; no workaround invented (owner directive)
- Symptom: The only DB target sanctioned for PHASE-03 (isolated Neon `development` branch, project `tiny-mud-82763154`) has NO connection string available in the sandbox: `.env.local` does not exist and no other legitimate source holds it.
- Reproduction: exhaustive name/shape-only scan (no secret values printed): (1) `.env.local` / `.env.development*` / `.env.production` ABSENT — only the 1-line scaffold `.env` (non-Neon value) exists; (2) shell env var names: no `NEON_*`/`PG*`/`AUTH_SESSION_SECRET`/`APP_URL`, only scaffold `DATABASE_URL` (non-Neon); (3) no Neon config dirs (`~/.config/neon`, `~/.neon`), no neonctl, no Neon API key anywhere in the sandbox; (4) git-ignored `.auth/` vault contains only `.auth/verify/neon-{1-create,3-verify,4-smoke,5-drop}.mjs` — scanned CLEAN: zero embedded connection strings (each reads credentials via `process.env`; their target `phase02_drizzle_verify_tmp` was dropped at PHASE-02 end, so any previously passed value is dead); (5) the only Neon URL reachable in this ecosystem is the Vercel Development/Production shared `DATABASE_URL` — FORBIDDEN (points at Production `neondb` on `main`).
- Root cause: the compensating-control step documented in docs/ops/DATABASE.md §9.3 Step 1.6 (owner copies the `development` branch's POOLED connection string into git-ignored `.env.local`) has not been performed/propagated into this sandbox; no supported first-party path exists for the agent to obtain the string itself (Vercel Development URL = Production, forbidden; no Neon control-plane credential).
- Affected layer/files: ALL DB-backed PHASE-03 tasks (login endpoint, session creation/expiry, throttling, bootstrap command, change-password flow, activity logging, and their tests/verification); missing file: `/home/z/my-project/.env.local`. NO application files touched this round.
- Minimal fix (owner action — exactly one of):
  - **Option A (primary, per §9.3 Step 1.6):** in Neon Console → project `tiny-mud-82763154` → **Branches** → open the **`development`** branch (NOT main) → **Connect** → enable **Pooled connection** → copy the string into a NEW file `/home/z/my-project/.env.local` (workspace file access) containing exactly one line: `DATABASE_URL=<development-branch pooled string>`. CRITICAL: the string MUST come from the `development` branch's own Connect panel — the project-level/default Connect button delivers the `main` (Production) branch credentials, which must never enter the sandbox. Never through chat/email/IM; the file is git-ignored (`.gitignore` line 34 `.env*`; `git check-ignore .env.local` passes).
  - **Option B (only if the owner has no direct sandbox file access):** owner issues a Neon API key (owner-issued, per DATABASE.md §9.2 precedent) into the git-ignored `.auth/` vault via their own secure file channel; upon explicit owner authorization the agent performs a READ-ONLY Neon API call (project `tiny-mud-82763154`, branch `development` → pooled connection URI) and writes `.env.local` itself; the value is never printed/logged/chatted. NOT executed without explicit owner authorization.
- Verification command/check (after the owner action, before any PHASE-03 use): `test -f /home/z/my-project/.env.local && git -C /home/z/my-project check-ignore .env.local`; agent then verifies WITHOUT printing values: URL is a `*.neon.tech` POOLED host; `sha256(DATABASE_URL) ≠ a77fc2afd8ac2bd7…` (the recorded production fingerprint); host/endpoint id differs from the production endpoint; then a `SELECT 1` probe and `drizzle-kit migrate` (DRIZZLE_DATABASE_URL aimed explicitly) target that URL ONLY.
- Final status: RESOLVED (2026-09-27, same session).

**Closing addendum (2026-09-27, PHASE-03 unblock round):**
- The owner supplied the `development`-branch POOLED connection string through an authorized channel and explicitly delegated `.env.local` creation to the agent ("Do not stop merely because the credential needs to be placed in `.env.local`"). The file was created git-ignored (chmod 600) and the full verification checklist above PASSED with values never displayed: git-ignored ✓; pooled `*.neon.tech` host (endpoint id `ep-dark-boat-b1fejsk4`) ✓; **sha256 = e5d2abaf3816965f… ≠ production fingerprint a77fc2afd8ac2bd7…** ✓; read-only probe → `neondb`, PostgreSQL 18.6, 0 public tables, only platform `neon_auth` schema ✓ (owner attestation + fingerprint inequality = identity evidence; no production endpoint id was ever recorded, so hash inequality is the operative discriminator).
- All PHASE-03 database work then ran against exactly this URL, explicitly sourced per command: `drizzle-kit migrate` (direct endpoint of the SAME endpoint id) → 23/23 tables + 9/9 enums + migration hash == committed file; `db:bootstrap`; `db:seed`; `db:verify` 28/28; `db:bootstrap:admin`; `verify:auth` 29/29. Vercel `development` DATABASE_URL was never opened; Neon `main`/Production was never connected to.

### ISSUE-2026-09-27-021
- Phase: PHASE_03 (browser/QA round, 2026-09-27)
- Severity: HIGH (security control misbehaved — throttling triggered on non-failure traffic patterns and counted non-failure rows)
- Status: FIXED
- Symptom: repeated-bad-login QA loop returned 429 on attempt 2 while only ONE failure row existed for the submitted username; the throttle counted rows irrespective of their action type.
- Reproduction: `curl` login attempts sequence after a prior mixed login history; `getLoginThrottleState` returned `throttled=true` with `recentFailures` exceeding the actual `auth.login.failed` row count.
- Root cause: drizzle's `and()` inlines raw `sql` fragments verbatim WITHOUT parenthesizing them — the `or` between the username and ipHash identity conditions bound looser than the AND-ed `action`/`createdAt` filters, so the count matched "any activity row with this IP hash" (including successes) regardless of action or window.
- Minimal fix: fully parenthesize the OR pair in `getLoginThrottleState` (`((u = $username) or (i = $ipHash))`) with an explanatory comment; `clearLoginFailures` (single raw condition) was already safe.
- Verification: QA failure rows cleared → clean loop 5×401 → 429 + Retry-After on attempt 6; browser shows the Arabic throttle message; recovery after transient-row cleanup; `bun run verify:auth` 29/29 (its throttle probe uses the username-only path and passes alongside the fixed SQL).
- Related files: `src/lib/auth/throttle.ts`
- Notes: caught by the phase's own QA loop exactly as the verification plan intended; recorded for transparency per ERROR_PROTOCOL.

**ISSUE-2026-09-27-019 — Addendum (2026-09-27, PHASE-03 unblock round — compensating control ACTIVE):**
- The owner-provided `development`-branch POOLED string is now operationally live in git-ignored `.env.local` (verification chain in ISSUE-2026-09-27-020's closing addendum). All local PHASE-03 database work ran against the isolated branch; the Vercel `development` environment remains production-bound and WRITE-PROHIBITED.
- Scope of this issue therefore narrows further: "Vercel `development` environment still maps to the production branch; the isolated Neon `development` branch is the active local development target via `.env.local`; future `vercel-dev` binding option remains recorded in DATABASE.md §9.5." Status stays OPEN (binding gap only).

### ISSUE-2026-09-27-022
- Phase: PHASE_03 (owner-mandated targeted security audit, 2026-09-27 — AFTER phase completion, BEFORE PHASE-04)
- Severity: HIGH (missing explicit CSRF control on state-changing admin endpoints; session-sensitive responses cacheable)
- Status: FIXED
- Symptom: owner-directed OWASP-referenced audit of all state-changing admin endpoints (login / logout / change-password) found that SameSite=Lax on the session cookie was the SOLE cross-site request defense — no Origin/Referer validation and no CSRF token; authentication/session-sensitive responses (auth endpoints + /admin pages) carried no Cache-Control: no-store.
- Reference standard: OWASP CSRF Prevention Cheat Sheet — "Verifying Origin With Standard Headers" + "SameSite must not be the sole CSRF defense"; owner audit criteria #1–#5 (origin validation / explicit CSRF or equivalent same-origin mechanism / SameSite as defense-in-depth only / no state-changing GETs / no-store on session-sensitive responses).
- Audit result against the 10 criteria: #4 (no state-changing GET — only POST admin endpoints; bootstrap is CLI-only) ✓, #6 (cookie HttpOnly/SameSite/host-only/path/Secure-on-https) ✓, #7 (session fixation impossible — fresh 256-bit CSPRNG token per login, SHA-256 at rest, all sessions revoked on password change) ✓, #8 (authorization: requireAdminMutation + DB re-validation on change-password; logout token-scoped idempotent) ✓, #9 (throttle post-ISSUE-021 correct) ✓, #10 (no credential/session leakage — redaction filter, name-only error logs) ✓; #1/#2 FAIL → this fix; #3 defense-in-depth now complemented by #1; #5 FAIL → fixed here.
- Root cause: PHASE-03 implemented the cookie flags required by its task list but no explicit same-origin/CSRF request control, and no explicit no-store cache policy on auth responses.
- Minimal fix (PHASE-03 scope only): new `src/lib/auth/origin.ts` — `isSameOriginRequest()` (strict Origin/Referer-vs-deployment-origin match, default-port normalisation, literal-null rejection, x-forwarded-host/proto aware, localhost allowances only when NODE_ENV !== 'production', reject requests with NO attestation) + `isJsonRequest()` (application/json enforcement — browser HTML forms cannot send it) + `withNoStore()` (Cache-Control: no-store). Wired BEFORE any body parsing / DB work into login + logout + change-password; every response of the three endpoints wrapped; middleware stamps ALL /admin responses with no-store. No schema change, no new endpoints, no unrelated refactors.
- Verification (isolated Neon development branch ONLY; Production/Vercel-Development URL never touched):
  - `bun run verify:auth` extended with section [12] — 15 new checks (same-site accepted, cross-site/look-alike/null/no-attestation rejected, default-port normalisation both directions, Referer fallback, APP_URL allowlist, JSON content-type enforcement, withNoStore header, normalizeOrigin malformed rejection) → **44 passed, 0 failed**
  - curl matrix on the dev server — 15/15: cross-origin login 403+no-store; no-Origin 403; text/plain spoof 403; same-origin wrong creds 401 (gate passed); real login 200 + no-store + `HttpOnly; SameSite=lax; Path=/` host-only cookie; Referer fallback 200; **authenticated cross-site logout 403 AND session survived (GET /admin 200)**; same-origin logout 200+no-store; cross-site/no-Origin change-password 403/403; same-origin wrong-current-password 401 (no rotation); unauthenticated change-password 401; /admin/login no-store; /admin → 307 /admin/login + no-store; real password still valid after the full matrix
  - Browser QA (agent-browser): browser-native same-origin fetch → 401 + no-store (browser automatic Origin passes the gate through the real request path); text/plain fetch → 403; wrong-credential UI generic Arabic error; /admin unauthenticated → redirect; zero console/page errors; zero horizontal overflow 375/1440
  - typecheck ✅ lint ✅; test artifacts cleaned from the dev branch (1 probe failure row + 4 test sessions removed)
- Related files: `src/lib/auth/origin.ts` (new), `src/app/api/admin/auth/{login,logout,change-password}/route.ts`, `src/middleware.ts`, `scripts/verify-auth.ts`
- Notes: found only by the owner's post-completion audit; recorded per ERROR_PROTOCOL. Non-browser clients have no sanctioned use of the admin dashboard (single-admin model, MASTER_PLAN §16) — requests without Origin/Referer are rejected by design.

### ISSUE-2026-09-27-023
- Phase: PHASE_04 (2026-09-27)
- Severity: MEDIUM (deployment-time configuration gap; does not block any PHASE-04 task's logic)
- Status: OPEN — configuration pending (owner action at deployment; tracked for PHASE-14)
- Symptom: `BLOB_READ_WRITE_TOKEN` is absent from the sandbox environment, so the Vercel Blob provider cannot be exercised live here; the admin media UI shows an honest "uploads not configured" banner and the upload endpoint answers 503 with the exact remediation.
- Root cause: connecting a Vercel Blob store to the project (which provisions the token in Vercel environments) is an owner-side dashboard action; nothing in the sandbox can mint it.
- Impact: 13/14 PHASE-04 tasks fully implemented AND verified, including the entire media service abstraction (validation: magic-byte mime sniffing / 8 MB ceiling / sharp dimensions; registry; reference guards; attach/reorder/replace). Only the live "bytes → Blob" hop awaits the token; the provider is isolated behind `src/lib/media/service.ts` per MASTER_PLAN §20, so enabling it requires zero code changes.
- Minimal fix (owner action at deployment): Vercel dashboard → project `amira-store` → Storage → create/connect a Blob store → the token appears automatically in Vercel environments. For local use, copy it into git-ignored `.env.local`.
- Verification performed: upload endpoint 503 + honest banner in the unconfigured state; full validation + registry + reference-guard behavior verified with fixture assets against the development branch (verify-catalog [10]).
- Related files: `src/lib/media/*`, `.env.example`
- Notes: NOT a workaround — the media service abstraction with the honest unconfigured state is exactly the MASTER_PLAN §20 contract; live-verification of the Blob hop is recorded as a PHASE-14 deployment-checklist item.

### ISSUE-2026-09-27-024
- Phase: PHASE_04 (browser QA round, 2026-09-27)
- Severity: MEDIUM (editor state bug caught before push)
- Status: FIXED
- Symptom: after a successful product save + `router.refresh()`, the SECOND save failed 422 with "رمز SKU مستخدم بالفعل" although the admin had not duplicated anything.
- Root cause: the editor's `useState` initializers run only on mount; after refresh the server re-render passed a NEW aggregate (with persisted variant ids), but the editor state still held the pre-save rows (`id: null`), so the next save re-submitted existing variants as new ones and the service's foreign-SKU pre-check correctly refused.
- Minimal fix: `useEffect` resync in `ProductEditor` keyed on the aggregate prop identity (server refreshes produce a new props object; client re-renders reuse the same object), resetting product/variants/images/sizeGuide/attributeIds to persisted truth.
- Verification: full editor golden path re-run in the browser — first save creates variants, second save (gallery + variant image + size guide) succeeds; DB rows verified (2 variants, gallery image, variant-level image, size-guide row).
- Related files: `src/app/admin/(protected)/products/[id]/product-editor.tsx`
- Notes: the service rejection was CORRECT behavior — the bug was purely client state lifecycle.

### ISSUE-2026-09-27-025
- Phase: PHASE_04 (browser QA round, 2026-09-27)
- Severity: HIGH (environment; login 500 in the sandbox dev server after restart) — FIXED
- Symptom: after restarting the dev server, every admin login returned 500; the underlying pg-pool error was `AggregateError [ECONNREFUSED ::1:5432, 127.0.0.1:5432]` — the app was dialing LOCAL Postgres instead of the Neon development branch.
- Root cause: the sandbox shell exports a scaffold-era local `DATABASE_URL`; Next.js gives PROCESS env precedence over `.env.local`, so a dev server started from a shell carrying the scaffold variable shadowed the authorized development-branch URL in `.env.local`. (Prior rounds' server instance predated the shadow, masking it.)
- Minimal fix: start the dev server with `.env.local` sourced explicitly (`set -a; . ./.env.local; set +a; bun run dev`), which pins the process env to the development branch. Recorded as the standing restart protocol.
- Verification: login restored (401 generic rejection on bad credentials, 200 + cookie on the real credential); every subsequent DB-touching QA step passed against the development branch.
- Related files: none (environment protocol; documented in DATABASE.md §10 and the worklog)
- Notes: database safety was NEVER violated — the scaffold URL points at a non-Neon local database; no Production or Vercel-Development credential was involved at any point.
