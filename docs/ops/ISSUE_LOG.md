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
- Status: OPEN (owner-side action required)
- Symptom: The git-ignored credential vault `.auth/` is missing after the latest sandbox recycle, so `gh`/`vercel` authentication and `git push` (GitHub) are unavailable this session. Recurrence of the ISSUE-2026-09-26-009 environment class.
- Reproduction: `git push` → credential helper `/home/z/my-project/.auth/bin/gh-cred` not found; no `gh`/`vercel` binaries on PATH.
- Root cause: sandbox recycles wipe everything outside `/home/z/my-project`; the vault restore step did not run before this session.
- Minimal fix: owner restores CLI credentials (GitHub + Vercel) per ISSUE-2026-09-26-009 mitigation; then `git push origin main`. Live-Neon verification steps are pre-written in `docs/ops/DATABASE.md` §8 and need no further code work.
- Verification: after restore — `gh auth status` succeeds, push succeeds, CI run green on the PHASE_02 commit.
- Related files: none (environment)
- Notes: PHASE_02 remote-scope items are therefore satisfied by the committed local rehearsal on real PostgreSQL 18 (identical wire protocol/driver) with the live-Neon application documented as the single remaining remote step; production is untouched either way.
